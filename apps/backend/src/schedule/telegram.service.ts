import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { TelegramTestResponse } from "@assistant/shared";
import { SettingsService } from "../settings/settings.service";

const TELEGRAM_BASE = "https://api.telegram.org";
const REQUEST_TIMEOUT_MS = 10_000;

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly settings: SettingsService) {}

  async sendMessage(userId: string, text: string): Promise<void> {
    const cfg = await this.resolveConfig(userId);
    if (!cfg) {
      this.logger.warn(
        `Telegram not configured for user ${userId} — skip message`,
      );
      return;
    }
    await this.post(cfg, text);
  }

  async sendTest(userId: string): Promise<TelegramTestResponse> {
    const cfg = await this.resolveConfig(userId);
    if (!cfg) {
      throw new BadRequestException({
        code: "telegram_not_configured",
        message:
          "Chưa cấu hình Telegram. Vui lòng nhập bot token và chat_id trong Cài đặt.",
      });
    }
    try {
      await this.post(
        cfg,
        "✅ Personal Assistant: kết nối Telegram thành công.",
      );
      return { ok: true, message: "Đã gửi tin nhắn thử nghiệm." };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown error";
      return { ok: false, message: `Không gửi được: ${message}` };
    }
  }

  private async resolveConfig(userId: string): Promise<TelegramConfig | null> {
    const token = await this.settings.decryptTelegramToken(userId);
    if (!token) return null;
    const settings = await this.settings.getForUser(userId);
    if (!settings.telegramChatId) return null;
    return { botToken: token, chatId: settings.telegramChatId };
  }

  private async post(cfg: TelegramConfig, text: string): Promise<void> {
    const url = `${TELEGRAM_BASE}/bot${cfg.botToken}/sendMessage`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cfg.chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await safeBody(res);
        throw new Error(`Telegram API ${res.status}: ${body}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

async function safeBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 200);
  } catch {
    return "<unable to read body>";
  }
}
