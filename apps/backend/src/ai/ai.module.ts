import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ExpenseModule } from "../expense/expense.module";
import { NotesModule } from "../notes/notes.module";
import { ScheduleModule } from "../schedule/schedule.module";
import { SettingsModule } from "../settings/settings.module";
import { AiController } from "./ai.controller";
import { AiProviderService } from "./ai-provider.service";
import { AiService } from "./ai.service";
import { AiToolsService } from "./ai-tools.service";
import { AiConversationEntity } from "./entities/ai-conversation.entity";
import { AiMessageEntity } from "./entities/ai-message.entity";
import { AiToolCallEntity } from "./entities/ai-tool-call.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiConversationEntity,
      AiMessageEntity,
      AiToolCallEntity,
    ]),
    SettingsModule,
    NotesModule,
    ScheduleModule,
    ExpenseModule,
  ],
  controllers: [AiController],
  providers: [AiService, AiProviderService, AiToolsService],
})
export class AiModule {}
