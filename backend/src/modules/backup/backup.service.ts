import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// execFile, а не exec: не запускает shell, поэтому спецсимволы в пароле/путях
// не могут превратиться в команду.
const execFileAsync = promisify(execFile);

/** Имя файла резервной копии, которое создаёт этот сервис. */
// .enc — зашифрованная копия (см. encryptIfConfigured)
const BACKUP_FILENAME_RE = /^backup-[0-9T:.-]+\.sql(\.enc)?$/;
const isBackupFile = (f: string) => BACKUP_FILENAME_RE.test(f);

export interface BackupRecord {
  id: string; filename: string; path: string; size: number;
  type: string; status: string; createdAt: Date; expiresAt: Date;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private config: ConfigService) {}

  @Cron(process.env.BACKUP_CRON || '0 2 * * *')
  async scheduledBackup() {
    this.logger.log('Scheduled backup started');
    await this.createBackup(undefined, 'auto');
  }

  async createBackup(userId?: string, _type = 'manual'): Promise<{ filename: string; size: number }> {
    const backupDir = this.config.get('BACKUP_DIR', '/app/backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.sql`;
    const filepath = path.join(backupDir, filename);

    const dbHost = this.config.get('DB_HOST', 'localhost');
    const dbPort = this.config.get('DB_PORT', '5432');
    const dbName = this.config.get('DB_NAME', 'it_inventory');
    const dbUser = this.config.get('DB_USER', 'inventory');
    const dbPass = this.config.get('DB_PASSWORD', 'changeme');

    try {
      // Пароль передаём через окружение процесса, а не в строке команды:
      // PGPASSWORD="..." — синтаксис POSIX-шелла, на Windows он не работал вовсе.
      //
      // Путь к pg_dump настраивается: на Windows каталог PostgreSQL обычно не
      // добавлен в PATH, и запуск падал с ENOENT — вторая причина, по которой
      // ночная копия не создавалась.
      const pgDump = this.config.get<string>('PG_DUMP_PATH') || 'pg_dump';
      await execFileAsync(
        pgDump,
        ['-h', String(dbHost), '-p', String(dbPort), '-U', String(dbUser), '-d', String(dbName), '-f', filepath],
        { env: { ...process.env, PGPASSWORD: String(dbPass) } },
      );
      // Шифруем, если задан ключ. Дамп содержит всю базу целиком, включая
      // хэши паролей и данные сотрудников, — в открытом виде такой файл
      // опаснее самой базы: у базы хотя бы есть разграничение доступа.
      const finalPath = await this.encryptIfConfigured(filepath);
      const finalName = path.basename(finalPath);

      const stats = fs.statSync(finalPath);
      this.logger.log(`Backup created: ${finalName} (${stats.size} bytes)`);

      // Копия за пределами машины: если диск умрёт вместе с базой,
      // копии рядом с ней пропадут заодно.
      await this.mirrorOffMachine(finalPath);

      await this.cleanOldBackups(backupDir);
      return { filename: finalName, size: stats.size };
    } catch (err: any) {
      this.logger.error('Backup failed', err.message);
      throw new Error(`Backup failed: ${err.message}`);
    }
  }

  /**
   * Шифрование AES-256-GCM ключом из BACKUP_ENCRYPTION_KEY.
   *
   * GCM, а не CBC: помимо шифрования он даёт проверку целостности — повреждённый
   * или подменённый файл не расшифруется молча. Формат файла:
   * [соль 16][вектор 12][тег 16][шифротекст]. Соль на каждый файл своя,
   * ключ выводится scrypt — так пароль средней длины остаётся пригодным.
   *
   * Без ключа шифрование пропускается: включать его молча нельзя, иначе
   * существующие процедуры восстановления перестанут работать без предупреждения.
   */
  private async encryptIfConfigured(plainPath: string): Promise<string> {
    const secret = this.config.get<string>('BACKUP_ENCRYPTION_KEY');
    if (!secret) {
      this.logger.warn('BACKUP_ENCRYPTION_KEY не задан — копия сохранена без шифрования');
      return plainPath;
    }

    const encPath = `${plainPath}.enc`;
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(secret, salt, 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const plain = fs.readFileSync(plainPath);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    fs.writeFileSync(encPath, Buffer.concat([salt, iv, cipher.getAuthTag(), encrypted]));

    // Незашифрованный дамп на диске не оставляем
    fs.unlinkSync(plainPath);
    return encPath;
  }

  /**
   * Копирование во второе расположение — сетевую папку или примонтированный
   * диск (BACKUP_MIRROR_DIR). Сбой копирования не проваливает создание копии:
   * лучше иметь копию на одной машине, чем не иметь никакой.
   */
  private async mirrorOffMachine(filePath: string): Promise<void> {
    const mirrorDir = this.config.get<string>('BACKUP_MIRROR_DIR');
    if (!mirrorDir) return;
    try {
      if (!fs.existsSync(mirrorDir)) fs.mkdirSync(mirrorDir, { recursive: true });
      const target = path.join(mirrorDir, path.basename(filePath));
      fs.copyFileSync(filePath, target);
      this.logger.log(`Копия продублирована: ${target}`);
    } catch (err: any) {
      this.logger.error(`Не удалось продублировать копию в ${mirrorDir}: ${err.message}`);
    }
  }

  private async cleanOldBackups(backupDir: string) {
    const retentionDays = parseInt(this.config.get('BACKUP_RETENTION_DAYS', '30'));
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
    const files = fs.readdirSync(backupDir).filter(isBackupFile);
    for (const file of files) {
      const fpath = path.join(backupDir, file);
      const stat = fs.statSync(fpath);
      if (stat.mtime < cutoff) {
        fs.unlinkSync(fpath);
        this.logger.log(`Deleted old backup: ${file}`);
      }
    }
  }

  async listBackups() {
    const backupDir = this.config.get('BACKUP_DIR', '/app/backups');
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir)
      .filter(isBackupFile)
      .map(f => {
        const fpath = path.join(backupDir, f);
        const stat = fs.statSync(fpath);
        return { filename: f, size: stat.size, createdAt: stat.mtime, path: fpath };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Путь к файлу копии по имени. Имя приходит из URL, поэтому проверяется строго:
   * без этого `../../..` в параметре давал чтение любого файла на диске.
   */
  getBackupPath(filename: string): string {
    if (!BACKUP_FILENAME_RE.test(filename)) {
      throw new BadRequestException('Недопустимое имя файла резервной копии');
    }
    const backupDir = path.resolve(this.config.get('BACKUP_DIR', '/app/backups'));
    // basename отсекает любые сегменты пути, resolve + проверка префикса —
    // страховка на случай символических ссылок и нестандартных разделителей.
    const resolved = path.resolve(backupDir, path.basename(filename));
    if (path.relative(backupDir, resolved).startsWith('..')) {
      throw new BadRequestException('Недопустимое имя файла резервной копии');
    }
    return resolved;
  }
}
