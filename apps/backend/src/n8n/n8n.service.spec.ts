import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { N8nService, RETRY_GRACE_MS } from "./n8n.service";
import type { N8nConfig, SettingsService } from "../settings/settings.service";

const CONFIG: N8nConfig = {
  baseUrl: "https://n8n.example.com",
  apiKey: "n8n-api-key-xyz",
};

function makeService(cfg: N8nConfig | null): N8nService {
  const settings = {
    getN8nConfig: jest.fn().mockResolvedValue(cfg),
  } as unknown as SettingsService;
  return new N8nService(settings);
}

interface Route {
  match: string;
  status?: number;
  body?: unknown;
}

/** fetch giả lập định tuyến theo URL (list gọi cả /workflows lẫn /executions). */
function routeFetch(routes: Route[]): jest.Mock {
  const fn = jest.fn().mockImplementation((url: string) => {
    const route = routes.find((r) => url.includes(r.match));
    const status = route?.status ?? 200;
    const body = route?.body;
    return Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      text: async () => (body === undefined ? "" : JSON.stringify(body)),
    } as unknown as Response);
  });
  (global as { fetch: unknown }).fetch = fn;
  return fn;
}

const ORIGINAL_FETCH = global.fetch;
afterEach(() => {
  (global as { fetch: unknown }).fetch = ORIGINAL_FETCH;
  jest.clearAllMocks();
});

describe("N8nService.listExecutions", () => {
  it("maps {data,nextCursor}, resolves workflow name, runtime, retryOf", async () => {
    const svc = makeService(CONFIG);
    routeFetch([
      {
        match: "/api/v1/workflows",
        body: { data: [{ id: "wf1", name: "LKI Tracker Prod" }], nextCursor: null },
      },
      {
        match: "/api/v1/executions",
        body: {
          data: [
            {
              id: 268,
              status: "canceled",
              mode: "trigger",
              retryOf: 253,
              retrySuccessId: null,
              workflowId: "wf1",
              startedAt: "2026-06-10T19:38:15.000Z",
              stoppedAt: "2026-06-10T19:38:27.397Z",
              finished: true,
            },
            {
              id: 263,
              status: "running",
              workflowId: "wf1",
              startedAt: "2026-06-10T14:12:12.000Z",
              stoppedAt: null,
              finished: false,
            },
          ],
          nextCursor: null,
        },
      },
    ]);

    const res = await svc.listExecutions("u1", 10);

    expect(res.count).toBe(2);
    expect(res.results[0]).toMatchObject({
      id: "268",
      status: "canceled",
      retryOf: "253",
      // executions không trả workflowName → phải lấy từ /workflows.
      workflowName: "LKI Tracker Prod",
      runTimeMs: 12397,
      finished: true,
    });
    expect(res.results[1]).toMatchObject({ status: "running", runTimeMs: null });
  });

  it("derives status from `finished` when n8n omits the status field", async () => {
    const svc = makeService(CONFIG);
    routeFetch([
      { match: "/api/v1/workflows", body: { data: [] } },
      { match: "/api/v1/executions", body: { data: [{ id: "1", finished: true }] } },
    ]);

    const res = await svc.listExecutions("u1");
    expect(res.results[0].status).toBe("success");
  });

  it("sends X-N8N-API-KEY and hits /api/v1/executions with the limit", async () => {
    const svc = makeService(CONFIG);
    const fetchMock = routeFetch([
      { match: "/api/v1/workflows", body: { data: [] } },
      { match: "/api/v1/executions", body: { data: [] } },
    ]);

    await svc.listExecutions("u1", 5);

    const call = fetchMock.mock.calls.find(([u]) =>
      (u as string).includes("/api/v1/executions"),
    ) as [string, RequestInit];
    expect(call[0]).toBe("https://n8n.example.com/api/v1/executions?limit=5");
    const headers = call[1].headers as Record<string, string>;
    expect(headers["X-N8N-API-KEY"]).toBe("n8n-api-key-xyz");
    expect(headers.cookie).toBeUndefined();
  });

  it("still returns executions when the workflow-name lookup fails", async () => {
    const svc = makeService(CONFIG);
    routeFetch([
      { match: "/api/v1/workflows", status: 500, body: { message: "boom" } },
      { match: "/api/v1/executions", body: { data: [{ id: "9", status: "success", workflowId: "wf1" }] } },
    ]);

    const res = await svc.listExecutions("u1");
    expect(res.results[0]).toMatchObject({ id: "9", workflowName: null });
  });

  it("throws a 400 (not 401) when the API key is rejected", async () => {
    const svc = makeService(CONFIG);
    routeFetch([{ match: "/api/v1", status: 401 }]);

    await expect(svc.listExecutions("u1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.listExecutions("u1")).rejects.toMatchObject({
      response: { code: "n8n_unauthorized" },
    });
  });

  it("throws n8n_not_configured when no config is stored", async () => {
    const svc = makeService(null);
    const fetchMock = routeFetch([{ match: "/api/v1", body: {} }]);

    await expect(svc.listExecutions("u1")).rejects.toMatchObject({
      response: { code: "n8n_not_configured" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces an executions 5xx as a 503", async () => {
    const svc = makeService(CONFIG);
    routeFetch([
      { match: "/api/v1/workflows", body: { data: [] } },
      { match: "/api/v1/executions", status: 500, body: { message: "boom" } },
    ]);

    await expect(svc.listExecutions("u1")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe("N8nService.retryExecution", () => {
  it("posts loadWorkflow and returns completed + new execution id when it finishes fast", async () => {
    const svc = makeService(CONFIG);
    const fetchMock = routeFetch([{ match: "/retry", body: { id: 999 } }]);

    const res = await svc.retryExecution("u1", "253", true);

    expect(res).toEqual({ ok: true, executionId: "999", status: "completed" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://n8n.example.com/api/v1/executions/253/retry");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ loadWorkflow: true });
  });

  it("returns a null id when the response is not an execution object", async () => {
    const svc = makeService(CONFIG);
    routeFetch([{ match: "/retry", body: true }]);

    const res = await svc.retryExecution("u1", "253", false);
    expect(res).toEqual({ ok: true, executionId: null, status: "completed" });
  });

  it("returns accepted (background) when the retry outruns the grace window", async () => {
    jest.useFakeTimers();
    try {
      const svc = makeService(CONFIG);
      // n8n chạy đồng bộ và lâu → fetch không settle trong thời gian chờ.
      (global as { fetch: unknown }).fetch = jest.fn(
        () => new Promise<Response>(() => {}),
      );

      const promise = svc.retryExecution("u1", "253", false);
      await jest.advanceTimersByTimeAsync(RETRY_GRACE_MS);

      await expect(promise).resolves.toEqual({
        ok: true,
        executionId: null,
        status: "accepted",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("propagates a fast failure (rejected key) instead of returning accepted", async () => {
    const svc = makeService(CONFIG);
    routeFetch([{ match: "/retry", status: 401 }]);

    await expect(svc.retryExecution("u1", "253", false)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("N8nService.deleteExecution", () => {
  it("issues DELETE /api/v1/executions/:id", async () => {
    const svc = makeService(CONFIG);
    const fetchMock = routeFetch([{ match: "/api/v1/executions", body: {} }]);

    await svc.deleteExecution("u1", "253");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://n8n.example.com/api/v1/executions/253");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });
});

describe("N8nService.stopExecution", () => {
  it("POSTs to /api/v1/executions/:id/stop", async () => {
    const svc = makeService(CONFIG);
    const fetchMock = routeFetch([{ match: "/stop", body: { id: 253 } }]);

    await svc.stopExecution("u1", "253");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://n8n.example.com/api/v1/executions/253/stop");
    expect(init.method).toBe("POST");
  });
});

describe("N8nService.getExecutionStats", () => {
  /** fetch giả lập trả từng trang executions theo thứ tự gọi (mô phỏng cursor). */
  function execFetch(
    pages: Array<{ data: unknown[]; nextCursor: string | null }>,
  ): jest.Mock {
    let i = 0;
    const fn = jest.fn().mockImplementation(() => {
      const page = pages[Math.min(i, pages.length - 1)];
      i += 1;
      return Promise.resolve({
        status: 200,
        ok: true,
        text: async () => JSON.stringify(page),
      } as unknown as Response);
    });
    (global as { fetch: unknown }).fetch = fn;
    return fn;
  }

  it("đếm theo status trên toàn bộ, đi theo nextCursor, failed = error + crashed", async () => {
    const svc = makeService(CONFIG);
    const fetchMock = execFetch([
      {
        data: [
          { id: 1, status: "success", finished: true },
          { id: 2, status: "error", finished: true },
          { id: 3, status: "crashed", finished: true },
        ],
        nextCursor: "c1",
      },
      {
        data: [
          { id: 4, status: "success", finished: true },
          { id: 5, status: "canceled", finished: true },
        ],
        nextCursor: null,
      },
    ]);

    const stats = await svc.getExecutionStats("u1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stats.total).toBe(5);
    expect(stats.byStatus.success).toBe(2);
    expect(stats.byStatus.error).toBe(1);
    expect(stats.byStatus.crashed).toBe(1);
    expect(stats.byStatus.canceled).toBe(1);
    expect(stats.failed).toBe(2);
    expect(stats.truncated).toBe(false);
    expect(fetchMock.mock.calls[1][0] as string).toContain("cursor=c1");
  });

  it("cache trong TTL: gọi lần 2 không fetch lại", async () => {
    const svc = makeService(CONFIG);
    const fetchMock = execFetch([
      { data: [{ id: 1, status: "success" }], nextCursor: null },
    ]);

    await svc.getExecutionStats("u1");
    await svc.getExecutionStats("u1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("đặt truncated khi vượt trần số trang quét", async () => {
    const svc = makeService(CONFIG);
    // Luôn còn cursor → service dừng ở trần và đánh dấu truncated.
    const fetchMock = execFetch([
      { data: [{ id: 1, status: "success" }], nextCursor: "more" },
    ]);

    const stats = await svc.getExecutionStats("u1");

    expect(stats.truncated).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("N8nService.getExecution", () => {
  it("maps detail, extracts the error, tags, and includes raw dataJson", async () => {
    const svc = makeService(CONFIG);
    routeFetch([
      { match: "/api/v1/workflows", body: { data: [{ id: "wf1", name: "LKI Tracker Prod" }] } },
      { match: "/tags", body: [{ id: "t1", name: "Production", createdAt: "x" }] },
      {
        match: "/api/v1/executions/253",
        body: {
          id: 253,
          status: "error",
          mode: "trigger",
          workflowId: "wf1",
          startedAt: "2026-06-10T04:11:13.000Z",
          stoppedAt: "2026-06-10T04:11:17.732Z",
          finished: true,
          data: {
            resultData: {
              lastNodeExecuted: "HTTP Request",
              error: {
                message: "Request failed with status 500",
                stack: "Error: boom\n  at ...",
                node: { name: "HTTP Request" },
              },
            },
          },
        },
      },
    ]);

    const detail = await svc.getExecution("u1", "253");

    expect(detail).toMatchObject({
      id: "253",
      status: "error",
      workflowName: "LKI Tracker Prod",
      runTimeMs: 4732,
      error: {
        message: "Request failed with status 500",
        nodeName: "HTTP Request",
      },
      tags: [{ id: "t1", name: "Production" }],
    });
    expect(detail.error?.stack).toContain("boom");
    expect(detail.dataJson).toContain("resultData");
  });

  it("returns null error and empty tags for a clean success", async () => {
    const svc = makeService(CONFIG);
    routeFetch([
      { match: "/api/v1/workflows", body: { data: [] } },
      { match: "/tags", status: 403 },
      {
        match: "/api/v1/executions/9",
        body: { id: 9, status: "success", workflowId: "wf1", finished: true, data: {} },
      },
    ]);

    const detail = await svc.getExecution("u1", "9");
    expect(detail.error).toBeNull();
    expect(detail.tags).toEqual([]);
    expect(detail.dataJson).toBeNull();
  });
});
