import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  expenseByCategoryQuerySchema,
  exportQuerySchema,
  trendQuerySchema,
  type ExpenseByCategoryQuery,
  type ExpenseByCategoryResponse,
  type ExportQuery,
  type TrendQuery,
  type TrendResponse,
} from "@assistant/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { UserEntity } from "../users/entities/user.entity";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get("expense-by-category")
  byCategory(
    @CurrentUser() user: UserEntity,
    @Query(new ZodValidationPipe(expenseByCategoryQuerySchema))
    query: ExpenseByCategoryQuery,
  ): Promise<ExpenseByCategoryResponse> {
    return this.svc.expenseByCategory(user.id, query);
  }

  @Get("trend")
  trend(
    @CurrentUser() user: UserEntity,
    @Query(new ZodValidationPipe(trendQuerySchema)) query: TrendQuery,
  ): Promise<TrendResponse> {
    return this.svc.trend(user.id, query);
  }

  @Get("export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportCsv(
    @CurrentUser() user: UserEntity,
    @Query(new ZodValidationPipe(exportQuerySchema)) query: ExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const body = await this.svc.exportCsv(user.id, query);
    const fname = `giao-dich-${query.from.slice(0, 10)}_${query.to.slice(0, 10)}.csv`;
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(body);
  }
}
