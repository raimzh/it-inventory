'use strict';
/**
 * Расшифровка резервной копии, созданной BackupService.
 *
 * Без этого инструмента зашифрованная копия бесполезна, поэтому он лежит
 * рядом с кодом и не зависит от собранного приложения — восстанавливаться
 * приходится тогда, когда приложение уже не работает.
 *
 * Формат файла: [соль 16][вектор 12][тег GCM 16][шифротекст]
 * Ключ выводится scrypt из BACKUP_ENCRYPTION_KEY.
 *
 * Использование:
 *   node scripts/decrypt-backup.js <файл.sql.enc> [файл.sql]
 *   BACKUP_ENCRYPTION_KEY=... node scripts/decrypt-backup.js backup-....sql.enc
 *
 * Затем восстановление:
 *   psql -U <роль> -d <база> -f backup-....sql
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function main() {
  const [input, outputArg] = process.argv.slice(2);
  if (!input) {
    console.error('Укажите файл: node scripts/decrypt-backup.js <файл.sql.enc> [файл.sql]');
    process.exit(1);
  }

  // Ключ читаем из окружения или из backend/.env — чтобы не передавать его
  // в командной строке, где он останется в истории оболочки
  let secret = process.env.BACKUP_ENCRYPTION_KEY;
  if (!secret) {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const m = /^BACKUP_ENCRYPTION_KEY=(.+)$/m.exec(fs.readFileSync(envPath, 'utf8'));
      if (m) secret = m[1].trim();
    }
  }
  if (!secret) {
    console.error('BACKUP_ENCRYPTION_KEY не задан — тем же ключом, что использовался при создании копии');
    process.exit(1);
  }

  const raw = fs.readFileSync(input);
  if (raw.length <= SALT_LEN + IV_LEN + TAG_LEN) {
    console.error('Файл слишком мал — похоже, это не зашифрованная копия');
    process.exit(1);
  }

  const salt = raw.subarray(0, SALT_LEN);
  const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const data = raw.subarray(SALT_LEN + IV_LEN + TAG_LEN);

  const key = crypto.scryptSync(secret, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let plain;
  try {
    plain = Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    // GCM проверяет целостность: сюда попадаем при неверном ключе
    // или повреждённом файле — и это ровно то, что нужно знать заранее
    console.error('Расшифровать не удалось: неверный ключ либо файл повреждён');
    process.exit(1);
  }

  const output = outputArg || input.replace(/\.enc$/, '');
  fs.writeFileSync(output, plain);
  console.log(`Расшифровано: ${output} (${plain.length} байт)`);
}

main();
