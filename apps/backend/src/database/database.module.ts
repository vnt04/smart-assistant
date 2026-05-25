import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule, type TypeOrmModuleOptions } from "@nestjs/typeorm";
import { UserEntity } from "../users/entities/user.entity";
import { UserSettingsEntity } from "../settings/user-settings.entity";
import { RefreshTokenEntity } from "../auth/refresh-token.entity";
import { NotebookEntity } from "../notes/entities/notebook.entity";
import { NoteEntity } from "../notes/entities/note.entity";
import { TagEntity } from "../notes/entities/tag.entity";
import { AttachmentEntity } from "../notes/entities/attachment.entity";
import { EventEntity } from "../schedule/entities/event.entity";
import { TaskEntity } from "../schedule/entities/task.entity";
import { ReminderEntity } from "../schedule/entities/reminder.entity";
import { WalletEntity } from "../expense/entities/wallet.entity";
import { CategoryEntity } from "../expense/entities/category.entity";
import { TransactionEntity } from "../expense/entities/transaction.entity";
import { BudgetEntity } from "../expense/entities/budget.entity";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
        type: "mysql",
        host: config.get<string>("MYSQL_HOST") ?? "localhost",
        port: Number(config.get<number>("MYSQL_PORT") ?? 3306),
        username: config.get<string>("MYSQL_USER") ?? "assistant",
        password: config.get<string>("MYSQL_PASSWORD") ?? "",
        database: config.get<string>("MYSQL_DATABASE") ?? "assistant",
        charset: "utf8mb4_unicode_ci",
        timezone: "Z",
        synchronize: false,
        autoLoadEntities: false,
        entities: [
          UserEntity,
          UserSettingsEntity,
          RefreshTokenEntity,
          NotebookEntity,
          NoteEntity,
          TagEntity,
          AttachmentEntity,
          EventEntity,
          TaskEntity,
          ReminderEntity,
          WalletEntity,
          CategoryEntity,
          TransactionEntity,
          BudgetEntity,
        ],
        logging:
          config.get<string>("NODE_ENV") === "development"
            ? ["error", "warn"]
            : ["error"],
      }),
    }),
  ],
})
export class DatabaseModule {}
