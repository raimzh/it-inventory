import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

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

    const cmd = `PGPASSWORD="${dbPass}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f "${filepath}"`;

    try {
      await execAsync(cmd);
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

  getBackupPath(filename: string): string {
    const backupDir = this.config.get('BACKUP_DIR', '/app/backups');
    return path.join(backupDir, filename);
  }
}
