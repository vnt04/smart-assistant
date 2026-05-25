import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SettingsModule } from "../settings/settings.module";
import { EventEntity } from "./entities/event.entity";
import { ReminderEntity } from "./entities/reminder.entity";
import { TaskEntity } from "./entities/task.entity";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { RemindersController } from "./reminders.controller";
import { RemindersQueue } from "./reminders.queue";
import { RemindersService } from "./reminders.service";
import { RemindersWorker } from "./reminders.worker";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";
import { TelegramService } from "./telegram.service";

@Module({
  imports: [
    ConfigModule,
    SettingsModule,
    TypeOrmModule.forFeature([EventEntity, TaskEntity, ReminderEntity]),
  ],
  controllers: [EventsController, TasksController, RemindersController],
  providers: [
    EventsService,
    TasksService,
    RemindersService,
    RemindersQueue,
    RemindersWorker,
    TelegramService,
  ],
  exports: [EventsService, TasksService, RemindersService, TelegramService],
})
export class ScheduleModule {}
