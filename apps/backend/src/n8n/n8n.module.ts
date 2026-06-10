import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { N8nController } from "./n8n.controller";
import { N8nService } from "./n8n.service";

@Module({
  imports: [SettingsModule],
  controllers: [N8nController],
  providers: [N8nService],
})
export class N8nModule {}
