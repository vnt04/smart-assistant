import { Controller, Get } from "@nestjs/common";
import type { HealthCheck } from "@assistant/shared";

@Controller("health")
export class HealthController {
  private readonly startedAt = Date.now();
  private readonly version = process.env.npm_package_version ?? "0.1.0";

  @Get()
  check(): HealthCheck {
    return {
      status: "ok",
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      version: this.version,
    };
  }
}
