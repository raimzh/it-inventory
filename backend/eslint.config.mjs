import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Линтер бэкенда.
 *
 * Заводится с нуля: скрипт `lint` в package.json был, а самого eslint в
 * зависимостях не было — команда либо падала, либо тянула через npx
 * случайную свежую версию. То есть сто с лишним файлов бэкенда не
 * проверялись никогда.
 *
 * Формат flat config, как во фронтенде: eslint 9 старый .eslintrc не
 * читает.
 *
 * Взят набор recommended без проверки типов. Правила с типами мощнее, но
 * требуют полного разбора проекта на каждый запуск и на существующем
 * коде дают вал замечаний — линтер, который все привыкают пропускать,
 * бесполезен. Ужесточать имеет смысл потом, когда база чистая.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    rules: {
      // NestJS строится на декораторах и внедрении зависимостей: пустые
      // конструкторы с модификаторами доступа и обязательные типы там,
      // где их выводит фреймворк, — норма, а не упущение
      '@typescript-eslint/no-extraneous-class': 'off',

      // Правило требует `new Error(msg, { cause })`, но второй аргумент
      // появился в ES2022, а проект собирается под ES2021 (tsconfig).
      // Включить можно будет вместе с поднятием цели компиляции —
      // это отдельное решение, а не настройка линтера
      'preserve-caught-error': 'off',

      // Слой TypeORM и разбор внешних данных (1С, Excel) местами
      // работают с неизвестной структурой. Запрет any здесь дал бы
      // сотни замечаний без выигрыша в надёжности; ограничиваемся
      // предупреждением, чтобы новые случаи были заметны
      '@typescript-eslint/no-explicit-any': 'warn',

      // Неиспользованное — реальная находка, но аргументы с подчёркиванием
      // и перехваченные ошибки, которые намеренно игнорируются,
      // замечаниями быть не должны
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
        // `const { passwordHash, ...result } = user` — штатный способ не
        // отдать хеш наружу. Переменная действительно не используется,
        // в том и смысл, ругаться тут не на что
        ignoreRestSiblings: true,
      }],
    },
  },

  {
    // Тесты — обычный CommonJS на Node, а не собираемый TypeScript
    files: ['test/**/*.js'],
    languageOptions: {
      globals: { require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly' },
    },
  },
);
