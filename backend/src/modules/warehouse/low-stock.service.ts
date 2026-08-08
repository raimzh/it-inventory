import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { User, UserRole } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Напоминание о позициях ниже точки заказа.
 *
 * Отчёт «к закупу» уже существует, но в него нужно зайти. Смысл рассылки в
 * том, чтобы про заканчивающиеся расходники узнавали без визита в систему —
 * иначе картриджи кончаются в момент, когда они нужны.
 *
 * Расписание задаётся LOW_STOCK_CRON. Если переменная не задана, рассылка
 * выключена: почта настроена не везде, а молчаливые попытки отправки только
 * засоряют журнал.
 */
@Injectable()
export class LowStockService {
  private readonly logger = new Logger(LowStockService.name);

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    @InjectRepository(User) private userRepo: Repository<User>,
    private config: ConfigService,
    private notifications: NotificationsService,
  ) {}

  @Cron(process.env.LOW_STOCK_CRON || '0 9 * * 1')
  async scheduledCheck() {
    if (!process.env.LOW_STOCK_CRON) return;
    await this.notifyLowStock();
  }

  /** Позиции ниже точки заказа со средним расходом — та же выборка, что в отчёте. */
  async getLowStock(): Promise<Array<{ sku: string; name: string; balance: number; minStock: number }>> {
    const rows = await this.dataSource.query(
      `SELECT sku, name, min_stock AS "minStock", total_balance AS balance
       FROM v_low_stock ORDER BY name`,
    );
    return rows.map((r: any) => ({ ...r, balance: Number(r.balance), minStock: Number(r.minStock) }));
  }

  /**
   * Рассылает сводку тем, кто отвечает за закуп.
   * Возвращает, что именно было отправлено, — это же используется для
   * проверки вручную, без ожидания расписания.
   */
  async notifyLowStock(): Promise<{ items: number; recipients: number }> {
    const items = await this.getLowStock();
    if (!items.length) {
      this.logger.log('Позиций ниже точки заказа нет — рассылка не требуется');
      return { items: 0, recipients: 0 };
    }

    // Закупом занимаются бухгалтеры и администраторы; берём только тех,
    // кто не отключил почтовые уведомления
    const recipients = await this.userRepo.find({
      where: [
        { role: UserRole.ADMIN, isActive: true, emailNotifications: true },
        { role: UserRole.ACCOUNTANT, isActive: true, emailNotifications: true },
      ],
    });

    const rows = items
      .map((i) => `<tr><td>${i.sku}</td><td>${i.name}</td><td align="right">${i.balance}</td><td align="right">${i.minStock}</td></tr>`)
      .join('');
    const html = `
      <h2>Позиции к закупу</h2>
      <p>Ниже точки заказа: ${items.length}.</p>
      <table border="1" cellpadding="6" cellspacing="0">
        <tr><th>Артикул</th><th>Наименование</th><th>Остаток</th><th>Точка заказа</th></tr>
        ${rows}
      </table>`;

    for (const user of recipients) {
      if (user.email) {
        await this.notifications.sendEmail(user.email, `К закупу: ${items.length} позиций`, html);
      }
      if (user.telegramNotifications && user.telegramChatId) {
        await this.notifications.sendTelegram(
          user.telegramChatId,
          `<b>К закупу: ${items.length} позиций</b>\n` +
            items.slice(0, 10).map((i) => `• ${i.name}: ${i.balance} (мин. ${i.minStock})`).join('\n'),
        );
      }
    }

    this.logger.log(`Уведомление о низком остатке: ${items.length} позиций, получателей ${recipients.length}`);
    return { items: items.length, recipients: recipients.length };
  }
}
