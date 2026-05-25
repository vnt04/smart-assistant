import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type {
  Budget,
  BudgetStatus,
  CreateBudgetInput,
  UpdateBudgetInput,
} from "@assistant/shared";
import { TelegramService } from "../schedule/telegram.service";
import { BudgetEntity } from "./entities/budget.entity";
import { CategoryEntity } from "./entities/category.entity";
import { TransactionEntity } from "./entities/transaction.entity";

@Injectable()
export class BudgetsService {
  private readonly logger = new Logger(BudgetsService.name);

  constructor(
    @InjectRepository(BudgetEntity)
    private readonly repo: Repository<BudgetEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categories: Repository<CategoryEntity>,
    @InjectRepository(TransactionEntity)
    private readonly tx: Repository<TransactionEntity>,
    private readonly telegram: TelegramService,
  ) {}

  async list(userId: string, month?: string): Promise<BudgetStatus[]> {
    const where = month ? { userId, month } : { userId };
    const rows = await this.repo.find({
      where,
      order: { month: "DESC", createdAt: "DESC" },
    });
    const out: BudgetStatus[] = [];
    for (const b of rows) {
      const spent = await this.sumForBudget(b);
      out.push(buildStatus(b, spent));
    }
    return out;
  }

  async findOne(userId: string, id: string): Promise<Budget> {
    return toDto(await this.assertOwnership(userId, id));
  }

  async create(userId: string, input: CreateBudgetInput): Promise<Budget> {
    const cat = await this.categories.findOne({
      where: { id: input.categoryId, userId },
    });
    if (!cat) {
      throw new NotFoundException({
        code: "category_not_found",
        message: "Không tìm thấy danh mục",
      });
    }
    if (cat.kind !== "expense") {
      throw new ConflictException({
        code: "budget_category_kind",
        message: "Chỉ tạo ngân sách cho danh mục chi tiêu",
      });
    }
    const existing = await this.repo.findOne({
      where: { userId, categoryId: input.categoryId, month: input.month },
    });
    if (existing) {
      throw new ConflictException({
        code: "budget_exists",
        message: "Ngân sách cho danh mục này trong tháng đã tồn tại",
      });
    }
    const entity = this.repo.create({
      userId,
      categoryId: input.categoryId,
      month: input.month,
      amount: input.amount,
      alertThresholdPct: input.alertThresholdPct ?? 80,
      alertedAt: null,
    });
    return toDto(await this.repo.save(entity));
  }

  async update(
    userId: string,
    id: string,
    input: UpdateBudgetInput,
  ): Promise<Budget> {
    const entity = await this.assertOwnership(userId, id);
    if (input.amount !== undefined) {
      entity.amount = input.amount;
      entity.alertedAt = null;
    }
    if (input.alertThresholdPct !== undefined) {
      entity.alertThresholdPct = input.alertThresholdPct;
      entity.alertedAt = null;
    }
    await this.repo.save(entity);
    return toDto(entity);
  }

  async remove(userId: string, id: string): Promise<void> {
    const entity = await this.assertOwnership(userId, id);
    await this.repo.remove(entity);
  }

  async checkAndAlert(
    userId: string,
    categoryId: string,
    occurredAt: Date,
  ): Promise<void> {
    const month = monthKey(occurredAt);
    const budget = await this.repo.findOne({
      where: { userId, categoryId, month },
    });
    if (!budget) return;
    if (budget.alertedAt) return;

    const spent = await this.sumForBudget(budget);
    const amount = Number(budget.amount);
    const percent = amount > 0 ? (spent / amount) * 100 : 0;
    if (percent < budget.alertThresholdPct) return;

    const category = await this.categories.findOne({
      where: { id: categoryId, userId },
    });
    const name = category?.name ?? "Danh mục";
    const text = `⚠️ <b>Vượt ngân sách</b>\nDanh mục: ${escapeHtml(name)}\nTháng ${month}\nĐã chi ${formatVnd(spent)} / ${formatVnd(amount)} (${percent.toFixed(0)}%)`;

    try {
      await this.telegram.sendMessage(userId, text);
    } catch (err: unknown) {
      this.logger.warn(
        `telegram send budget alert failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
    budget.alertedAt = new Date();
    await this.repo.save(budget);
  }

  private async assertOwnership(
    userId: string,
    id: string,
  ): Promise<BudgetEntity> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException({
        code: "budget_not_found",
        message: "Không tìm thấy ngân sách",
      });
    }
    return row;
  }

  private async sumForBudget(budget: BudgetEntity): Promise<number> {
    const { from, to } = monthRange(budget.month);
    const row = await this.tx
      .createQueryBuilder("t")
      .select("COALESCE(SUM(t.amount),0)", "total")
      .where("t.user_id = :uid", { uid: budget.userId })
      .andWhere("t.category_id = :cid", { cid: budget.categoryId })
      .andWhere("t.kind = 'expense'")
      .andWhere("t.occurred_at >= :from", { from })
      .andWhere("t.occurred_at < :to", { to })
      .getRawOne<{ total: string | number | null }>();
    return Number(row?.total ?? 0);
  }
}

function buildStatus(b: BudgetEntity, spent: number): BudgetStatus {
  const amount = Number(b.amount);
  const remaining = amount - spent;
  const percent = amount > 0 ? (spent / amount) * 100 : 0;
  return {
    ...toDto(b),
    spent,
    remaining,
    percent: Math.round(percent * 10) / 10,
  };
}

function toDto(b: BudgetEntity): Budget {
  return {
    id: b.id,
    categoryId: b.categoryId,
    month: b.month,
    amount: Number(b.amount),
    alertThresholdPct: b.alertThresholdPct,
    alertedAt: b.alertedAt ? b.alertedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  return { from, to };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatVnd(n: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(n)} đ`;
}
