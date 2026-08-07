import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

// execFile, а не exec: не запускает shell, поэтому спецсимволы в пароле/путях
// не могут превратиться в команду.
const execFileAsync = promisify(execFile);

/** Имя файла резервной копии, которое создаёт этот сервис. */
const BACKUP_FILENAME_RE = /^backup-[0-9T:.\-]+\.sql$/;

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
    await this.createBackup(null, 'auto');
  }

  async createBackup(userId?: string, type = 'manual'): Promise<{ filename: string; size: number }> {
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
      // PGPASSWORD="..." — синтаксис POSIX-шелла, на Windows он не работал вовсе
      // (из-за этого ночной бэкап молча не создавал файлов).
      await execFileAsync(
        'pg_dump',
        ['-h', String(dbHost), '-p', String(dbPort), '-U', String(dbUser), '-d', String(dbName), '-f', filepath],
        { env: { ...process.env, PGPASSWORD: String(dbPass) } },
      );
      const stats = fs.statSync(filepath);
      this.logger.log(`Backup created: ${filename} (${stats.size} bytes)`);

      // Clean old backups
      await this.cleanOldBackups(backupDir);
      return { filename, size: stats.size };
    } catch (err) {
      this.logger.error('Backup failed', err.message);
      throw new Error(`Backup failed: ${err.message}`);
    }
  }

  private async cleanOldBackups(backupDir: string) {
    const retentionDays = parseInt(this.config.get('BACKUP_RETENTION_DAYS', '30'));
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('backup-') && f.endsWith('.sql'));
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
      .filter(f => f.startsWith('backup-') && f.endsWith('.sql'))
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
