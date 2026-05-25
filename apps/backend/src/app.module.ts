import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { validateEnv } from "./config/env.validation";
import { AuthModule } from "./auth/auth.module";
import { CryptoModule } from "./common/crypto/crypto.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { ExpenseModule } from "./expense/expense.module";
import { NotesModule } from "./notes/notes.module";
import { ScheduleModule } from "./schedule/schedule.module";
import { SettingsModule } from "./settings/settings.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [".env.local", ".env"],
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
    HealthModule,
  ],
})
export class AppModule {}
