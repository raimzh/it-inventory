/**
 * Проверка обязательных переменных окружения на старте.
 *
 * Секреты не имеют значений по умолчанию намеренно: дефолт вроде
 * 'supersecretjwtkey' попадает в репозиторий и становится публично известным,
 * а приложение при этом молча запускается и выглядит рабочим. Лучше упасть
 * на старте с внятным сообщением, чем работать с предсказуемым секретом.
 */

const REQUIRED = [
  'JWT_SECRET',   // подпись токенов
  'DB_PASSWORD',  // доступ к БД
] as const;

const MIN_SECRET_LENGTH = 16;

const WEAK_SECRETS = [
  'supersecretjwtkey',
  'superrefreshsecret',
  'changeme',
  'secret',
  'dev_local_jwt_secret',
];

export function validateEnv(): void {
  const problems: string[] = [];

  for (const key of REQUIRED) {
    const value = process.env[key];
    if (!value) {
      problems.push(`${key} не задана`);
      continue;
    }
    if (key === 'JWT_SECRET') {
      if (value.length < MIN_SECRET_LENGTH) {
        problems.push(`${key} короче ${MIN_SECRET_LENGTH} символов`);
      }
      if (WEAK_SECRETS.includes(value.toLowerCase())) {
        problems.push(`${key} использует известное значение по умолчанию — замените`);
      }
    }
  }

  if (problems.length) {
    throw new Error(
      'Некорректная конфигурация окружения:\n  - ' + problems.join('\n  - ') +
      '\nЗадайте переменные в backend/.env (см. .env.example) и перезапустите приложение.',
    );
  }
}
