import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JobsModule } from "../jobs/jobs.module";
import { JobSyncSourceEntity } from "./entities/job-sync-source.entity";
import { JobSyncRunEntity } from "./entities/job-sync-run.entity";
import { JobSyncController } from "./job-sync.controller";
import { JobSyncService } from "./job-sync.service";
import { JobSyncScheduler } from "./job-sync.scheduler";
import { JobSyncWorker } from "./job-sync.worker";
import { VietnamworksClient } from "./vietnamworks.client";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([JobSyncSourceEntity, JobSyncRunEntity]),
    JobsModule,
  ],
  controllers: [JobSyncController],
  providers: [
    JobSyncService,
    JobSyncScheduler,
    JobSyncWorker,
    VietnamworksClient,
  ],
})
export class JobSyncModule {}
