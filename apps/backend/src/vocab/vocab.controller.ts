import { Body, Controller, Get, Post, Res, UseFilters } from "@nestjs/common";
import type { Response } from "express";
import type { TrackVocabResponse, VocabItem } from "@assistant/shared";
import { VocabExceptionFilter } from "./vocab-exception.filter";
import { VocabService } from "./vocab.service";

/**
 * Public (no-auth) vocabulary tracking endpoint consumed by the browser
 * extension. Errors are reshaped to the extension contract
 * (`{ status: "error", reason }`) by VocabExceptionFilter.
 */
@Controller("vocab")
@UseFilters(VocabExceptionFilter)
export class VocabController {
  constructor(private readonly svc: VocabService) {}

  @Get()
  list(): Promise<VocabItem[]> {
    return this.svc.list();
  }

  @Post()
  async track(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TrackVocabResponse> {
    const result = await this.svc.track(body);
    res.status(result.status === "created" ? 201 : 200);
    return result;
  }
}
