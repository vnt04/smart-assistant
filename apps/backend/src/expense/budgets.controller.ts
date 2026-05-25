import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  budgetListQuerySchema,
  createBudgetInputSchema,
  updateBudgetInputSchema,
  type Budget,
  type BudgetListQuery,
  type BudgetStatus,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from "@assistant/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { UserEntity } from "../users/entities/user.entity";
import { BudgetsService } from "./budgets.service";

@Controller("budgets")
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private readonly svc: BudgetsService) {}

  @Get()
  list(
    @CurrentUser() user: UserEntity,
    @Query(new ZodValidationPipe(budgetListQuerySchema)) query: BudgetListQuery,
  ): Promise<BudgetStatus[]> {
    return this.svc.list(user.id, query.month);
  }

  @Get(":id")
  findOne(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<Budget> {
    return this.svc.findOne(user.id, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: UserEntity,
    @Body(new ZodValidationPipe(createBudgetInputSchema))
    input: CreateBudgetInput,
  ): Promise<Budget> {
    return this.svc.create(user.id, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateBudgetInputSchema))
    input: UpdateBudgetInput,
  ): Promise<Budget> {
    return this.svc.update(user.id, id, input);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.svc.remove(user.id, id);
  }
}
