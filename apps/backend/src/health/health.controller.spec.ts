import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    controller = module.get(HealthController);
  });

  it("returns status ok with uptime + timestamp + version", () => {
    const res = controller.check();
    expect(res.status).toBe("ok");
    expect(res.uptime).toBeGreaterThanOrEqual(0);
    expect(() => new Date(res.timestamp).toISOString()).not.toThrow();
    expect(typeof res.version).toBe("string");
  });
});
