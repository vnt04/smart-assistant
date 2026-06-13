import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  retryExecutionInputSchema,
  type N8nExecutionDetail,
  type N8nExecutionListResponse,
  type N8nExecutionStats,
  type N8nRetryResponse,
  type RetryExecutionInput,
} from "@assistant/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { UserEntity } from "../users/entities/user.entity";
import { N8nService } from "./n8n.service";

/** id execution của n8n: số tự tăng hoặc nanoid — chấp nhận chữ/số/`_`/`-`. */
const EXECUTION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Quản lý workflow executions của n8n. Yêu cầu đăng nhập (cấu hình n8n nằm trong
 * settings của user). Body retry validate bằng Zod; service đẩy lỗi upstream
 * thành 400/503 nên không gây đăng xuất nhầm ở frontend.
 */
@Controller("n8n")
@UseGuards(JwtAuthGuard)
export class N8nController {
  constructor(private readonly svc: N8nService) {}

  @Get("executions")
  list(
    @CurrentUser() user: UserEntity,
    @Query("limit") limit?: string,
  ): Promise<N8nExecutionListResponse> {
    return this.svc.listExecutions(user.id, parseLimit(limit));
  }

  // Phải khai báo TRƯỚC "executions/:id" để "stats" không bị :id bắt nhầm.
  @Get("executions/stats")
  stats(@CurrentUser() user: UserEntity): Promise<N8nExecutionStats> {
    return this.svc.getExecutionStats(user.id);
  }

  @Get("executions/:id")
  detail(
    @CurrentUser() user: UserEntity,
    @Param("id") id: string,
  ): Promise<N8nExecutionDetail> {
    return this.svc.getExecution(user.id, ensureExecutionId(id));
  }

  @Post("executions/:id/stop")
  @HttpCode(HttpStatus.NO_CONTENT)
  stop(
    @CurrentUser() user: UserEntity,
    @Param("id") id: string,
  ): Promise<void> {
    return this.svc.stopExecution(user.id, ensureExecutionId(id));
  }

  @Post("executions/:id/retry")
  @HttpCode(HttpStatus.OK)
  retry(
    @CurrentUser() user: UserEntity,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(retryExecutionInputSchema))
    input: RetryExecutionInput,
  ): Promise<N8nRetryResponse> {
    return this.svc.retryExecution(user.id, ensureExecutionId(id), input.loadWorkflow);
  }

  @Delete("executions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: UserEntity,
    @Param("id") id: string,
  ): Promise<void> {
    return this.svc.deleteExecution(user.id, ensureExecutionId(id));
  }
}

function ensureExecutionId(id: string): string {
  if (!EXECUTION_ID_RE.test(id)) {
    throw new BadRequestException({
      code: "n8n_invalid_execution_id",
      message: "Mã execution không hợp lệ",
    });
  }
  return id;
}

/** limit dạng chuỗi query → number; bỏ qua giá trị rác (service tự clamp). */
function parseLimit(limit?: string): number | undefined {
  if (limit === undefined) return undefined;
  const n = Number(limit);
  return Number.isFinite(n) ? n : undefined;
}
