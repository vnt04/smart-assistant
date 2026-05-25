import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@assistant/shared";
import { CategoryEntity } from "./entities/category.entity";
import { TransactionEntity } from "./entities/transaction.entity";
import { BudgetEntity } from "./entities/budget.entity";
import { DEFAULT_CATEGORY_SEED } from "./util/category-seed";

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly repo: Repository<CategoryEntity>,
    @InjectRepository(TransactionEntity)
    private readonly tx: Repository<TransactionEntity>,
    @InjectRepository(BudgetEntity)
    private readonly budgets: Repository<BudgetEntity>,
  ) {}

  async list(userId: string): Promise<Category[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { kind: "ASC", name: "ASC" },
    });
    return rows.map(toDto);
  }

  async findOne(userId: string, id: string): Promise<Category> {
    return toDto(await this.assertOwnership(userId, id));
  }

  async create(
    userId: string,
    input: CreateCategoryInput,
  ): Promise<Category> {
    if (input.parentId) {
      const parent = await this.assertOwnership(userId, input.parentId);
      if (parent.kind !== input.kind) {
        throw new ConflictException({
          code: "category_kind_mismatch",
          message: "Danh mục con phải cùng loại với danh mục cha",
        });
      }
    }
    const entity = this.repo.create({
      userId,
      parentId: input.parentId ?? null,
      name: input.name,
      kind: input.kind,
      icon: input.icon ?? null,
      color: input.color ?? null,
    });
    return toDto(await this.repo.save(entity));
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<Category> {
    const entity = await this.assertOwnership(userId, id);
    if (input.parentId !== undefined) {
      if (input.parentId === id) {
        throw new ConflictException({
          code: "category_self_parent",
          message: "Danh mục không thể là cha của chính nó",
        });
      }
      if (input.parentId) {
        const parent = await this.assertOwnership(userId, input.parentId);
        if (parent.kind !== entity.kind) {
          throw new ConflictException({
            code: "category_kind_mismatch",
            message: "Danh mục con phải cùng loại với danh mục cha",
          });
        }
      }
      entity.parentId = input.parentId;
    }
    if (input.name !== undefined) entity.name = input.name;
    if (input.icon !== undefined) entity.icon = input.icon;
    if (input.color !== undefined) entity.color = input.color;
    await this.repo.save(entity);
    return toDto(entity);
  }

  async remove(userId: string, id: string): Promise<void> {
    const entity = await this.assertOwnership(userId, id);
    const referenced = await this.tx.count({ where: { userId, categoryId: id } });
    const budgeted = await this.budgets.count({
      where: { userId, categoryId: id },
    });
    if (referenced > 0 || budgeted > 0) {
      throw new ConflictException({
        code: "category_in_use",
        message:
          "Danh mục đang được dùng bởi giao dịch hoặc ngân sách, không thể xoá",
      });
    }
    await this.repo.remove(entity);
  }

  async assertOwnership(userId: string, id: string): Promise<CategoryEntity> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException({
        code: "category_not_found",
        message: "Không tìm thấy danh mục",
      });
    }
    return row;
  }

  async seedDefaults(userId: string): Promise<void> {
    const existing = await this.repo.count({ where: { userId } });
    if (existing > 0) return;
    const rows = DEFAULT_CATEGORY_SEED.map((c) =>
      this.repo.create({
        userId,
        parentId: null,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
        color: c.color,
      }),
    );
    await this.repo.save(rows);
  }
}

function toDto(c: CategoryEntity): Category {
  return {
    id: c.id,
    parentId: c.parentId,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
    color: c.color,
    createdAt: c.createdAt.toISOString(),
  };
}
