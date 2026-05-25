import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type {
  CreateWalletInput,
  UpdateWalletInput,
  Wallet,
} from "@assistant/shared";
import { WalletEntity } from "./entities/wallet.entity";
import { TransactionEntity } from "./entities/transaction.entity";

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly repo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly tx: Repository<TransactionEntity>,
  ) {}

  async list(userId: string): Promise<Wallet[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { archived: "ASC", createdAt: "ASC" },
    });
    return rows.map(toDto);
  }

  async findOne(userId: string, id: string): Promise<Wallet> {
    return toDto(await this.assertOwnership(userId, id));
  }

  async create(userId: string, input: CreateWalletInput): Promise<Wallet> {
    const entity = this.repo.create({
      userId,
      name: input.name,
      type: input.type,
      balance: input.balance ?? 0,
      icon: input.icon ?? null,
      color: input.color ?? null,
      archived: false,
    });
    const saved = await this.repo.save(entity);
    return toDto(saved);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateWalletInput,
  ): Promise<Wallet> {
    const entity = await this.assertOwnership(userId, id);
    if (input.name !== undefined) entity.name = input.name;
    if (input.type !== undefined) entity.type = input.type;
    if (input.icon !== undefined) entity.icon = input.icon;
    if (input.color !== undefined) entity.color = input.color;
    if (input.archived !== undefined) entity.archived = input.archived;
    await this.repo.save(entity);
    return toDto(entity);
  }

  async remove(userId: string, id: string): Promise<void> {
    const entity = await this.assertOwnership(userId, id);
    const referenced = await this.tx.count({
      where: [
        { userId, walletId: id },
        { userId, transferToWalletId: id },
      ],
    });
    if (referenced > 0) {
      throw new ConflictException({
        code: "wallet_in_use",
        message:
          "Không thể xoá ví đang có giao dịch. Hãy lưu trữ (archive) thay vì xoá.",
      });
    }
    await this.repo.remove(entity);
  }

  async assertOwnership(userId: string, id: string): Promise<WalletEntity> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException({
        code: "wallet_not_found",
        message: "Không tìm thấy ví",
      });
    }
    return row;
  }

  async assertActive(userId: string, id: string): Promise<WalletEntity> {
    const wallet = await this.assertOwnership(userId, id);
    if (wallet.archived) {
      throw new BadRequestException({
        code: "wallet_archived",
        message: "Ví đã lưu trữ, không thể thêm giao dịch mới",
      });
    }
    return wallet;
  }
}

function toDto(w: WalletEntity): Wallet {
  return {
    id: w.id,
    name: w.name,
    type: w.type,
    balance: Number(w.balance),
    icon: w.icon,
    color: w.color,
    archived: Boolean(w.archived),
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}
