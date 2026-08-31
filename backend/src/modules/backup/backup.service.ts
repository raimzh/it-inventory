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

/**
 * Имя файла резервной копии, которое создаёт этот сервис.
 *
 * Буква Z обязательна: имя строится из toISOString(), и метка времени
 * заканчивается ею — `backup-2026-08-26T04-25-07-402Z.sql`. Без неё
 * выражение не совпадало ни с одним реально созданным файлом, и это
 * ломало всё, что через него фильтруется: список копий приходил пустым
 * при полном каталоге, скачивание отвечало «недопустимое имя», а
 * очистка не удаляла старые копии. Обнаруживается такое ровно в тот
 * момент, когда копия понадобилась.
 */
// .enc — зашифрованная копия (см. encryptIfConfigured)
const BACKUP_FILENAME_RE = /^backup-[0-9TZ:.-]+\.sql(\.enc)?$/;
const isBackupFile = (f: string) => BACKUP_FILENAME_RE.test(f);

/**
 * Сколько дней держать копии в локальном каталоге.
 *
 * 750 дней ≈ два года: годовую инвентаризацию должно быть с чем сравнить.
 * Объём при этом не пугает — копия базы весит порядка 730 КБ, то есть
 * полный срок занимает около 535 МБ. Если копия однажды вырастет на
 * порядок, пересчитайте это число вместе со свободным местом: заполнить
 * диск рядом с базой означает уронить саму базу, а не только копии.
 *
 * Зеркало (BACKUP_MIRROR_DIR) этим сроком НЕ ограничено, см. cleanOldBackups.
 */
const DEFAULT_RETENTION_DAYS = 750;

/** Что делать с ротацией: сколько дней держать и держать ли вообще. */
export interface RetentionPolicy {
  days: number;
  /** false — не удалять ничего */
  enabled: boolean;
  /** Значение задано и оно бессмысленное: в журнал это идёт как ошибка */
  invalid: boolean;
  reason?: string;
}

/**
 * Разбор BACKUP_RETENTION_DAYS.
 *
 * Любое непонятное значение ОТКЛЮЧАЕТ ротацию, а не подставляет умолчание.
 * Это единственное место в системе, которое необратимо удаляет данные:
 * при сомнении надо сохранить лишнее, а не удалить нужное.
 *
 * Ноль трактуется как «хранить бессрочно». Раньше он означал ровно
 * обратное — давал границу, равную текущему моменту, и первая же ночная
 * задача сносила ВСЕ копии, включая только что созданную. Подмена смысла
 * на противоположный — худшее, что могло случиться с этой настройкой.
 *
 * Number, а не parseInt: parseInt('30d') это 30, а parseInt('30.5') это 30 —
 * опечатка молча превратилась бы в правдоподобный срок.
 */
export function resolveRetentionDays(raw?: unknown): RetentionPolicy {
  const text = raw === undefined || raw === null ? '' : String(raw).trim();
  if (text === '') {
    return { days: DEFAULT_RETENTION_DAYS, enabled: true, invalid: false };
  }

  const n = Number(text);
  if (!Number.isInteger(n)) {
    return {
      days: 0, enabled: false, invalid: true,
      reason: `BACKUP_RETENTION_DAYS="${text}" — не целое число дней`,
    };
  }
  if (n === 0) {
    return {
      days: 0, enabled: false, invalid: false,
      reason: 'BACKUP_RETENTION_DAYS=0 — копии хранятся бессрочно',
    };
  }
  if (n < 0) {
    return {
      days: 0, enabled: false, invalid: true,
      reason: `BACKUP_RETENTION_DAYS=${n} — отрицательный срок`,
    };
  }
  return { days: n, enabled: true, invalid: false };
}

/** Итог уборки: нужен, чтобы её сбой было видно отдельно от сбоя копирования. */
export interface RotationSummary {
  deleted: number; kept: number; failed: number; skipped: boolean;
}

export interface BackupRecord {
  id: string; filename: string; path: string; size: number;
  type: string; status: string; createdAt: Date; expiresAt: Date;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private config: ConfigService) {}

  // process.env, а не this.config: декоратор вычисляется при загрузке класса,
  // когда контейнера внедрения зависимостей ещё нет. Это не недосмотр —
  // переписать на ConfigService нельзя
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

      // Уборка идёт последней и не умеет бросать (см. cleanOldBackups).
      // Раньше её сбой попадал в общий catch ниже и выдавался наружу как
      // «Backup failed» — при том, что копия уже создана и продублирована.
      // Администратор шёл искать несуществующую беду с копированием вместо
      // настоящей: прав на каталог
      const rotation = await this.cleanOldBackups(backupDir, finalName);
      if (rotation.failed) {
        this.logger.error(
          `Копия ${finalName} создана, но уборка старых прошла с ошибками: ${rotation.failed}`,
        );
      }
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

  /**
   * Ротация копий в ЛОКАЛЬНОМ каталоге (BACKUP_DIR).
   *
   * Зеркало (BACKUP_MIRROR_DIR) здесь не трогается сознательно: локальный
   * каталог живёт на диске рядом с базой и ограничен его объёмом, а зеркало —
   * бессрочный архив. Асимметрия намеренная, а не забытая.
   *
   * Метод не бросает исключений НИКОГДА — на этом держится вызов в
   * createBackup. Инвариант закреплён тестом (assert.doesNotReject), потому
   * что полагаться на аккуратность будущих правок здесь слишком дорого.
   *
   * keepFilename — копия, созданная в этом же запуске: её не удаляем ни при
   * каких настройках. Дешёвая страховка от любой ошибки в арифметике окна.
   */
  private async cleanOldBackups(backupDir: string, keepFilename?: string): Promise<RotationSummary> {
    const summary: RotationSummary = { deleted: 0, kept: 0, failed: 0, skipped: false };

    try {
      const policy = resolveRetentionDays(this.config.get('BACKUP_RETENTION_DAYS'));
      if (!policy.enabled) {
        summary.skipped = true;
        if (policy.invalid) {
          this.logger.error(`Ротация отключена: ${policy.reason}. Копии НЕ удаляются — поправьте .env`);
        } else {
          this.logger.log(`Ротация не выполняется: ${policy.reason}`);
        }
        return summary;
      }

      const cutoff = Date.now() - policy.days * 24 * 3600 * 1000;

      for (const file of fs.readdirSync(backupDir).filter(isBackupFile)) {
        if (keepFilename && file === keepFilename) { summary.kept++; continue; }
        const fpath = path.join(backupDir, file);
        try {
          // mtimeMs, а не mtime: сравнение чисел вместо дат. При нечисловой
          // границе сравнение объектов Date молча давало false — верный итог
          // по случайной причине, на такое опираться нельзя
          if (fs.statSync(fpath).mtimeMs >= cutoff) { summary.kept++; continue; }
          fs.unlinkSync(fpath);
          summary.deleted++;
          this.logger.log(`Удалена устаревшая копия: ${file}`);
        } catch (err: any) {
          // Один заблокированный файл не должен останавливать уборку остальных
          summary.failed++;
          this.logger.error(`Не удалось удалить ${file}: ${err.message}`);
        }
      }

      this.logger.log(
        `Ротация (${policy.days} дн.): удалено ${summary.deleted}, оставлено ${summary.kept}` +
        (summary.failed ? `, ошибок ${summary.failed}` : ''),
      );
    } catch (err: any) {
      summary.failed++;
      this.logger.error(`Ротация копий не выполнена: ${err.message}`);
    }

    return summary;
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
