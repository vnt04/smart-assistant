import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "../schedule/schedule.module";
import { BudgetsController } from "./budgets.controller";
import { BudgetsService } from "./budgets.service";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { BudgetEntity } from "./entities/budget.entity";
import { CategoryEntity } from "./entities/category.entity";
import { TransactionEntity } from "./entities/transaction.entity";
import { WalletEntity } from "./entities/wallet.entity";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { TransactionsController } from "./transactions.controller";
import { TransactionsService } from "./transactions.service";
import { WalletsController } from "./wallets.controller";
import { WalletsService } from "./wallets.service";

@Module({
  imports: [
    ScheduleModule,
    TypeOrmModule.forFeature([
      WalletEntity,
      CategoryEntity,
      TransactionEntity,
      BudgetEntity,
    ]),
  ],
  controllers: [
    WalletsController,
    CategoriesController,
    TransactionsController,
    BudgetsController,
    ReportsController,
  ],
  providers: [
    WalletsService,
    CategoriesService,
    TransactionsService,
    BudgetsService,
    ReportsService,
  ],
  exports: [
    WalletsService,
    CategoriesService,
    TransactionsService,
    BudgetsService,
    ReportsService,
  ],
})
export class ExpenseModule {}
