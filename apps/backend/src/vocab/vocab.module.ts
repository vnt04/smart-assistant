import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { VocabItemEntity } from "./entities/vocab-item.entity";
import { VocabController } from "./vocab.controller";
import { VocabService } from "./vocab.service";

@Module({
  imports: [TypeOrmModule.forFeature([VocabItemEntity])],
  controllers: [VocabController],
  providers: [VocabService],
  exports: [VocabService],
})
export class VocabModule {}
