import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  createJobSyncSourceInputSchema,
  updateJobSyncSourceInputSchema,
  type CreateJobSyncSourceInput,
  type JobSyncOverview,
  type JobSyncRun,
  type JobSyncRunListResponse,
  type JobSyncSource,
  type UpdateJobSyncSourceInput,
} from "@assistant/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { JobSyncService } from "./job-sync.service";

/**
 * Quản lý đồng bộ việc làm tự động (cron). Yêu cầu đăng nhập: các thao tác này
 * tạo request đi ra ngoài (VietnamWorks) và ghi vào bảng `jobs` chung. Body
 * create/update validate bằng Zod ở biên controller.
 */
@Controller("job-sync")
@UseGuards(JwtAuthGuard)
export class JobSyncController {
  constructor(private readonly svc: JobSyncService) {}

  /** Tổng quan (nguồn + run gần đây + đếm lỗi/đang chạy) — cho drawer & badge. */
  @Get("overview")
  overview(): Promise<JobSyncOverview> {
    return this.svc.getOverview();
  }

  @Get("sources")
  listSources(): Promise<JobSyncSource[]> {
    return this.svc.listSources();
  }

  @Post("sources")
  createSource(
    @Body(new ZodValidationPipe(createJobSyncSourceInputSchema))
    input: CreateJobSyncSourceInput,
  ): Promise<JobSyncSource> {
    return this.svc.createSource(input);
  }

  @Patch("sources/:id")
  updateSource(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateJobSyncSourceInputSchema))
    input: UpdateJobSyncSourceInput,
  ): Promise<JobSyncSource> {
    return this.svc.updateSource(id, input);
  }

  @Delete("sources/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSource(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.svc.deleteSource(id);
  }

  /** Chạy ngay (thủ công). Tạo run rồi chạy nền — trả run trạng thái "running". */
  @Post("sources/:id/run")
  @HttpCode(HttpStatus.ACCEPTED)
  runNow(@Param("id", ParseUUIDPipe) id: string): Promise<JobSyncRun> {
    return this.svc.runNow(id);
  }

  @Get("runs")
  listRuns(
    @Query("limit") limit?: string,
    @Query("sourceId") sourceId?: string,
  ): Promise<JobSyncRunListResponse> {
    return this.svc.listRuns(parseLimit(limit), parseSourceId(sourceId));
  }
}

function parseLimit(limit?: string): number {
  if (limit === undefined) return 50;
  const n = Number(limit);
  return Number.isFinite(n) ? n : 50;
}

/** Chỉ chấp nhận sourceId dạng UUID; rác → bỏ (liệt kê tất cả). */
function parseSourceId(sourceId?: string): string | undefined {
  if (!sourceId) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    sourceId,
  )
    ? sourceId
    : undefined;
}
