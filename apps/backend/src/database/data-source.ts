import "reflect-metadata";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { DataSource } from "typeorm";
import { UserEntity } from "../users/entities/user.entity";
import { UserSettingsEntity } from "../settings/user-settings.entity";
import { RefreshTokenEntity } from "../auth/refresh-token.entity";
import { NotebookEntity } from "../notes/entities/notebook.entity";
import { NoteEntity } from "../notes/entities/note.entity";
import { NoteReferenceEntity } from "../notes/entities/note-reference.entity";
import { TagEntity } from "../notes/entities/tag.entity";
import { AttachmentEntity } from "../notes/entities/attachment.entity";
import { ShareEntity } from "../notes/entities/share.entity";
import { ShareInviteEntity } from "../notes/entities/share-invite.entity";
import { EventEntity } from "../schedule/entities/event.entity";
import { TaskEntity } from "../schedule/entities/task.entity";
import { ReminderEntity } from "../schedule/entities/reminder.entity";
import { WalletEntity } from "../expense/entities/wallet.entity";
import { CategoryEntity } from "../expense/entities/category.entity";
import { TransactionEntity } from "../expense/entities/transaction.entity";
import { BudgetEntity } from "../expense/entities/budget.entity";
import { AiConversationEntity } from "../ai/entities/ai-conversation.entity";
import { AiMessageEntity } from "../ai/entities/ai-message.entity";
import { AiToolCallEntity } from "../ai/entities/ai-tool-call.entity";
import { VocabItemEntity } from "../vocab/entities/vocab-item.entity";
import { JobEntity } from "../jobs/entities/job.entity";
import { TechnologyEntity } from "../jobs/entities/technology.entity";
import { JobSyncSourceEntity } from "../job-sync/entities/job-sync-source.entity";
import { JobSyncRunEntity } from "../job-sync/entities/job-sync-run.entity";

// Loaded by the typeorm CLI; in app runtime ConfigModule handles env.
// Resolve from monorepo root so the CLI works regardless of cwd.
const repoRoot = path.resolve(__dirname, "../../../..");
loadEnv({ path: path.join(repoRoot, ".env.local") });
loadEnv({ path: path.join(repoRoot, ".env") });

const isCompiled = __filename.endsWith(".js");

const dataSource = new DataSource({
  type: "mysql",
  host: process.env.MYSQL_HOST ?? "localhost",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  username: process.env.MYSQL_USER ?? "assistant",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE ?? "assistant",
  charset: "utf8mb4_unicode_ci",
  timezone: "Z",
  synchronize: false,
  logging: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  entities: [
    UserEntity,
    UserSettingsEntity,
    RefreshTokenEntity,
    NotebookEntity,
    NoteEntity,
    NoteReferenceEntity,
    TagEntity,
    AttachmentEntity,
    ShareEntity,
    ShareInviteEntity,
    EventEntity,
    TaskEntity,
    ReminderEntity,
    WalletEntity,
    CategoryEntity,
    TransactionEntity,
    BudgetEntity,
    AiConversationEntity,
    AiMessageEntity,
    AiToolCallEntity,
    VocabItemEntity,
    JobEntity,
    TechnologyEntity,
    JobSyncSourceEntity,
    JobSyncRunEntity,
  ],
  migrations: [
    isCompiled
      ? "dist/database/migrations/*.js"
      : "src/database/migrations/*.ts",
  ],
});

export default dataSource;
