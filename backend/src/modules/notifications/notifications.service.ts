import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    const host = config.get('MAIL_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host, port: config.get<number>('MAIL_PORT', 587),
        auth: { user: config.get('MAIL_USER'), pass: config.get('MAIL_PASS') },
      });
    }
  }

  async sendEmail(to: string, subject: string, html: string) {
    if (!this.transporter) { this.logger.warn('Mail not configured'); return; }
    try {
      await this.transporter.sendMail({ from: this.config.get('MAIL_FROM'), to, subject, html });
    } catch (err) {
      this.logger.error('Email send failed', err.message);
    }
  }

  async sendTelegram(chatId: string, message: string) {
    const token = this.config.get('TELEGRAM_BOT_TOKEN');
    if (!token) { this.logger.warn('Telegram not configured'); return; }
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
      });
    } catch (err) {
      this.logger.error('Telegram send failed', err.message);
    }
  }

  async sendSyncErrorNotification(errors: any[]) {
    if (!errors.length) return;
    this.logger.warn(`Sync completed with ${errors.length} errors`);
  }

  async notifyMissingAssets(assets: any[], recipients: string[]) {
    const html = `<h2>Отсутствующие ОС</h2><p>Обнаружено ${assets.length} отсутствующих ОС:</p><ul>${assets.slice(0, 10).map(a => `<li>${a.inventoryNumber} - ${a.name}</li>`).join('')}</ul>`;
    for (const email of recipients) {
      await this.sendEmail(email, `Отсутствующие ОС: ${assets.length} шт.`, html);
    }
  }
}
