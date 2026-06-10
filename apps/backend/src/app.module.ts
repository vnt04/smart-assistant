import * as path from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { validateEnv } from "./config/env.validation";

const REPO_ROOT = path.resolve(__dirname, "../../..");
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { CryptoModule } from "./common/crypto/crypto.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { ExpenseModule } from "./expense/expense.module";
import { NotesModule } from "./notes/notes.module";
import { ScheduleModule } from "./schedule/schedule.module";
import { SettingsModule } from "./settings/settings.module";
import { UsersModule } from "./users/users.module";
import { VocabModule } from "./vocab/vocab.module";
import { JobsModule } from "./jobs/jobs.module";
import { N8nModule } from "./n8n/n8n.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        path.join(REPO_ROOT, ".env.local"),
        path.join(REPO_ROOT, ".env"),
      ],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        transport:
          process.env.NODE_ENV === "production"
            ? undefined
            : {
                target: "pino-pretty",
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: "SYS:HH:MM:ss.l",
                  ignore: "pid,hostname,req.headers,res.headers",
                },
              },
        redact: ["req.headers.authorization", "req.headers.cookie", "*.password"],
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return "error";
          if (res.statusCode >= 400) return "warn";
          return "info";
        },
      },
    }),
    CryptoModule,
    DatabaseModule,
    UsersModule,
    SettingsModule,
    AuthModule,
    NotesModule,
    ScheduleModule,
    ExpenseModule,
    AiModule,
    VocabModule,
    JobsModule,
    N8nModule,
    HealthModule,
  ],
})
export class AppModule {}
