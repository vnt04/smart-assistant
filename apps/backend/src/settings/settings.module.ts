import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SettingsService } from "./settings.service";
import { UserSettingsEntity } from "./user-settings.entity";

@Module({
  imports: [TypeOrmModule.forFeature([UserSettingsEntity])],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
