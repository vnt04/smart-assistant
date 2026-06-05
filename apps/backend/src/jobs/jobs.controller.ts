import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import type { IngestJobResponse, Job } from "@assistant/shared";
import { JobsService } from "./jobs.service";

/**
 * Endpoint Jobs công khai (không yêu cầu đăng nhập). POST được n8n gọi để đẩy
 * job đã crawl vào; GET/DELETE phục vụ giao diện Jobs ở frontend. Body của POST
 * được Zod kiểm tra trong service nên dùng `@Body() unknown` để bỏ qua
 * ValidationPipe toàn cục.
 */
@Controller("jobs")
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @Get()
  list(): Promise<Job[]> {
    return this.svc.list();
  }

  @Post()
  async ingest(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IngestJobResponse> {
    const result = await this.svc.ingest(body);
    res.status(result.status === "created" ? 201 : 200);
    return result;
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.svc.remove(id);
  }
}
