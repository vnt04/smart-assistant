import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import type {
  CreateTransactionInput,
  Transaction,
  TransactionListQuery,
  TransactionListResponse,
  UpdateTransactionInput,
} from "@assistant/shared";
import { BudgetsService } from "./budgets.service";
import { CategoriesService } from "./categories.service";
import { CategoryEntity } from "./entities/category.entity";
import { TransactionEntity } from "./entities/transaction.entity";
import { WalletEntity } from "./entities/wallet.entity";

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(TransactionEntity)
    private readonly repo: Repository<TransactionEntity>,
    private readonly categories: CategoriesService,
    private readonly budgets: BudgetsService,
  ) {}

  async list(
    userId: string,
    query: TransactionListQuery,
  ): Promise<TransactionListResponse> {
    const qb = this.repo
      .createQueryBuilder("t")
      .where("t.user_id = :userId", { userId });

    if (query.from)
      qb.andWhere("t.occurred_at >= :from", { from: new Date(query.from) });
    if (query.to)
      qb.andWhere("t.occurred_at <= :to", { to: new Date(query.to) });
    if (query.walletId)
      qb.andWhere("(t.wallet_id = :wid OR t.transfer_to_wallet_id = :wid)", {
        wid: query.walletId,
      });
    if (query.categoryId)
      qb.andWhere("t.category_id = :cid", { cid: query.categoryId });
    if (query.kind) qb.andWhere("t.kind = :kind", { kind: query.kind });

    qb.orderBy("t.occurred_at", "DESC")
      .addOrderBy("t.created_at", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map(toDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findOne(userId: string, id: string): Promise<Transaction> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException({
        code: "transaction_not_found",
        message: "Không tìm thấy giao dịch",
      });
    }
    return toDto(row);
  }

  async create(
    userId: string,
    input: CreateTransactionInput,
  ): Promise<Transaction> {
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    if (input.kind !== "transfer" && input.categoryId) {
      const cat = await this.categories.assertOwnership(
        userId,
        input.categoryId,
      );
      if (cat.kind === "expense" && input.kind === "income") {
        throw new BadRequestException({
          code: "category_kind_mismatch",
          message: "Danh mục là chi tiêu nhưng giao dịch là thu nhập",
        });
      }
      if (cat.kind === "income" && input.kind === "expense") {
        throw new BadRequestException({
          code: "category_kind_mismatch",
          message: "Danh mục là thu nhập nhưng giao dịch là chi tiêu",
        });
      }
    }

    const saved = await this.ds.transaction(async (manager) => {
      const wRepo = manager.getRepository(WalletEntity);

      const source = await wRepo
        .createQueryBuilder("w")
        .setLock("pessimistic_write")
        .where("w.id = :id AND w.user_id = :uid", {
          id: input.walletId,
          uid: userId,
        })
        .getOne();
      if (!source) {
        throw new NotFoundException({
          code: "wallet_not_found",
          message: "Không tìm thấy ví nguồn",
        });
      }
      if (source.archived) {
        throw new BadRequestException({
          code: "wallet_archived",
          message: "Ví đã lưu trữ, không thể thêm giao dịch",
        });
      }

      let target: WalletEntity | null = null;
      if (input.kind === "transfer" && input.transferToWalletId) {
        target = await wRepo
          .createQueryBuilder("w")
          .setLock("pessimistic_write")
          .where("w.id = :id AND w.user_id = :uid", {
            id: input.transferToWalletId,
            uid: userId,
          })
          .getOne();
        if (!target) {
          throw new NotFoundException({
            code: "wallet_not_found",
            message: "Không tìm thấy ví đích",
          });
        }
        if (target.archived) {
          throw new BadRequestException({
            code: "wallet_archived",
            message: "Ví đích đã lưu trữ",
          });
        }
      }

      const amount = input.amount;
      if (input.kind === "expense") {
        source.balance = Number(source.balance) - amount;
      } else if (input.kind === "income") {
        source.balance = Number(source.balance) + amount;
      } else if (input.kind === "transfer" && target) {
        source.balance = Number(source.balance) - amount;
        target.balance = Number(target.balance) + amount;
      }
      await wRepo.save(source);
      if (target) await wRepo.save(target);

      const entity = manager.getRepository(TransactionEntity).create({
        userId,
        kind: input.kind,
        amount,
        walletId: input.walletId,
        transferToWalletId:
          input.kind === "transfer" ? input.transferToWalletId ?? null : null,
        categoryId: input.kind === "transfer" ? null : input.categoryId ?? null,
        occurredAt,
        note: input.note ?? null,
      });
      return manager.getRepository(TransactionEntity).save(entity);
    });

    if (saved.kind === "expense" && saved.categoryId) {
      this.budgets
        .checkAndAlert(userId, saved.categoryId, saved.occurredAt)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "unknown";
          this.logger.warn(`budget alert failed: ${message}`);
        });
    }

    return toDto(saved);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateTransactionInput,
  ): Promise<Transaction> {
    return this.ds.transaction(async (manager) => {
      const txRepo = manager.getRepository(TransactionEntity);
      const wRepo = manager.getRepository(WalletEntity);
      const catRepo = manager.getRepository(CategoryEntity);

      const tx = await txRepo.findOne({ where: { id, userId } });
      if (!tx) {
        throw new NotFoundException({
          code: "transaction_not_found",
          message: "Không tìm thấy giao dịch",
        });
      }

      if (input.amount !== undefined && input.amount !== Number(tx.amount)) {
        const oldAmount = Number(tx.amount);
        const newAmount = input.amount;
        const delta = newAmount - oldAmount;

        const source = await wRepo
          .createQueryBuilder("w")
          .setLock("pessimistic_write")
          .where("w.id = :id AND w.user_id = :uid", {
            id: tx.walletId,
            uid: userId,
          })
          .getOne();
        if (!source) {
          throw new NotFoundException({
            code: "wallet_not_found",
            message: "Không tìm thấy ví nguồn",
          });
        }

        if (tx.kind === "expense") {
          source.balance = Number(source.balance) - delta;
        } else if (tx.kind === "income") {
          source.balance = Number(source.balance) + delta;
        } else if (tx.kind === "transfer" && tx.transferToWalletId) {
          const target = await wRepo
            .createQueryBuilder("w")
            .setLock("pessimistic_write")
            .where("w.id = :id AND w.user_id = :uid", {
              id: tx.transferToWalletId,
              uid: userId,
            })
            .getOne();
          if (target) {
            source.balance = Number(source.balance) - delta;
            target.balance = Number(target.balance) + delta;
            await wRepo.save(target);
          }
        }
        await wRepo.save(source);
        tx.amount = newAmount;
      }

      if (input.categoryId !== undefined && tx.kind !== "transfer") {
        if (input.categoryId) {
          const cat = await catRepo.findOne({
            where: { id: input.categoryId, userId },
          });
          if (!cat) {
            throw new NotFoundException({
              code: "category_not_found",
              message: "Không tìm thấy danh mục",
            });
          }
        }
        tx.categoryId = input.categoryId;
      }
      if (input.occurredAt !== undefined)
        tx.occurredAt = new Date(input.occurredAt);
      if (input.note !== undefined) tx.note = input.note;

      const saved = await txRepo.save(tx);
      return toDto(saved);
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.ds.transaction(async (manager) => {
      const txRepo = manager.getRepository(TransactionEntity);
      const wRepo = manager.getRepository(WalletEntity);

      const tx = await txRepo.findOne({ where: { id, userId } });
      if (!tx) {
        throw new NotFoundException({
          code: "transaction_not_found",
          message: "Không tìm thấy giao dịch",
        });
      }

      const source = await wRepo
        .createQueryBuilder("w")
        .setLock("pessimistic_write")
        .where("w.id = :id", { id: tx.walletId })
        .getOne();
      if (source) {
        const amount = Number(tx.amount);
        if (tx.kind === "expense")
          source.balance = Number(source.balance) + amount;
        else if (tx.kind === "income")
          source.balance = Number(source.balance) - amount;
        else if (tx.kind === "transfer" && tx.transferToWalletId) {
          const target = await wRepo
            .createQueryBuilder("w")
            .setLock("pessimistic_write")
            .where("w.id = :id", { id: tx.transferToWalletId })
            .getOne();
          if (target) {
            source.balance = Number(source.balance) + amount;
            target.balance = Number(target.balance) - amount;
            await wRepo.save(target);
          }
        }
        await wRepo.save(source);
      }

      await txRepo.remove(tx);
    });
  }

  async sumExpenseInRange(
    userId: string,
    categoryId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const row = await this.repo
      .createQueryBuilder("t")
      .select("COALESCE(SUM(t.amount),0)", "total")
      .where("t.user_id = :userId", { userId })
      .andWhere("t.category_id = :cid", { cid: categoryId })
      .andWhere("t.kind = 'expense'")
      .andWhere("t.occurred_at >= :from", { from })
      .andWhere("t.occurred_at < :to", { to })
      .getRawOne<{ total: string | number | null }>();
    return Number(row?.total ?? 0);
  }
}

function toDto(t: TransactionEntity): Transaction {
  return {
    id: t.id,
    kind: t.kind,
    amount: Number(t.amount),
    walletId: t.walletId,
    transferToWalletId: t.transferToWalletId,
    categoryId: t.categoryId,
    occurredAt: t.occurredAt.toISOString(),
    note: t.note,
    createdAt: t.createdAt.toISOString(),
  };
}
