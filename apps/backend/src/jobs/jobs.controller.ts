import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import type { IngestJobResponse, Job, TechFacet } from "@assistant/shared";
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
  list(@Query("tech") tech?: string | string[]): Promise<Job[]> {
    return this.svc.list(parseTechSlugs(tech));
  }

  /** Facet công nghệ kèm số lượng job — dựng bộ lọc ở frontend. */
  @Get("tech-facets")
  techFacets(): Promise<TechFacet[]> {
    return this.svc.listTechFacets();
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

/**
 * Chuẩn hóa query `tech` về `string[]`: nhận lặp (`?tech=a&tech=b`) hoặc phẩy
 * (`?tech=a,b`); trim, bỏ rỗng, khử trùng lặp.
 */
function parseTechSlugs(tech?: string | string[]): string[] {
  if (tech === undefined) return [];
  const raw = Array.isArray(tech) ? tech : [tech];
  const slugs = raw
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  return [...new Set(slugs)];
}
