import { Entity, PrimaryGeneratedColumn, Column, Index, UpdateDateColumn } from 'typeorm';

/**
 * Настройка интерфейса, привязанная к пользователю.
 *
 * Хранилище «ключ — значение», а не колонка под каждую настройку: их
 * состав меняется вместе с интерфейсом, и заводить миграцию ради нового
 * переключателя — цена, несопоставимая с пользой. Первый потребитель —
 * состав колонок таблицы ОС (ключ asset-table-columns).
 *
 * Почему отдельная таблица, а не поле в users: настройки интерфейса не
 * имеют отношения к учётной записи как таковой, читаются другим кодом и
 * меняются на порядок чаще. Смешивать их с ролями и паролями — значит
 * трогать строку пользователя при каждом щелчке по переключателю.
 *
 * Таблица ведётся ТОЛЬКО миграцией (synchronize: false), как складские
 * сущности: dev-синхронизация не должна её трогать.
 */
@Entity({ name: 'user_preferences', synchronize: false })
@Index('uq_user_preferences_user_key', ['userId', 'key'], { unique: true })
export class UserPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** Что за настройка. Совпадает с именем хранилища на клиенте */
  @Column({ length: 100 })
  key: string;

  /**
   * Значение как есть, в том виде, в каком его понимает клиент.
   *
   * jsonb, а не text: структура настройки на сервере не разбирается, но
   * читаемость при отладке и возможность когда-нибудь спросить по полю
   * стоят того же места на диске.
   */
  @Column({ type: 'jsonb' })
  value: unknown;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
