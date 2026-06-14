import { ConflictException } from "@nestjs/common";
import type { Repository } from "typeorm";
import { JobSyncService } from "./job-sync.service";
import type { JobSyncSourceEntity } from "./entities/job-sync-source.entity";
import type { JobSyncRunEntity } from "./entities/job-sync-run.entity";
import type { JobsService } from "../jobs/jobs.service";
import type { VietnamworksClient } from "./vietnamworks.client";
import type { JobSyncScheduler } from "./job-sync.scheduler";

/** Tạo một nguồn tối thiểu để chạy executeRun. */
function makeSource(over: Partial<JobSyncSourceEntity> = {}): JobSyncSourceEntity {
  return {
    id: "src-1",
    name: "Test",
    provider: "vietnamworks",
    queries: ["q1", "q2"],
    filters: { cityId: 29, districtIds: [] },
    hitsPerPage: 100,
    maxPages: 3,
    schedule: { kind: "interval", everyMinutes: 60 },
    timezone: "Asia/Ho_Chi_Minh",
    enabled: true,
    lastStatus: null,
    lastRunAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as JobSyncSourceEntity;
}

function makeRun(): JobSyncRunEntity {
  return {
    id: "run-1",
    sourceId: "src-1",
    sourceName: "Test",
    trigger: "manual",
    status: "running",
    startedAt: new Date(),
    finishedAt: null,
    durationMs: null,
    pagesFetched: 0,
    jobsFound: 0,
    jobsCreated: 0,
    jobsUpdated: 0,
    jobsFailed: 0,
    queriesRun: ["q1", "q2"],
    errorMessage: null,
    createdAt: new Date(),
  } as JobSyncRunEntity;
}

interface Mocks {
  service: JobSyncService;
  runsSave: jest.Mock;
  sourcesUpdate: jest.Mock;
  ingest: jest.Mock;
  search: jest.Mock;
  runsCount: jest.Mock;
  sourcesFindOne: jest.Mock;
}

function setup(): Mocks {
  const runsSave = jest.fn(async (r: JobSyncRunEntity) => r);
  const sourcesUpdate = jest.fn(async () => ({ affected: 1 }));
  const runsCount = jest.fn(async () => 0);
  const sourcesFindOne = jest.fn(async () => makeSource());

  // ingest: lần đầu gặp jobId → "created", các lần sau → "updated".
  const seen = new Set<string>();
  const ingest = jest.fn(async (input: { jobId: string }) => {
    if (seen.has(input.jobId)) return { status: "updated", job: {} };
    seen.add(input.jobId);
    return { status: "created", job: {} };
  });

  const search = jest.fn();

  const sources = {
    findOne: sourcesFindOne,
    update: sourcesUpdate,
    find: jest.fn(async () => []),
  } as unknown as Repository<JobSyncSourceEntity>;
  const runs = {
    save: runsSave,
    update: jest.fn(async () => ({ affected: 1 })),
    count: runsCount,
    create: (r: Partial<JobSyncRunEntity>) => ({ ...makeRun(), ...r }),
    find: jest.fn(async () => []),
  } as unknown as Repository<JobSyncRunEntity>;
  const jobs = { ingest } as unknown as JobsService;
  const client = { search } as unknown as VietnamworksClient;
  const scheduler = {
    reconcile: jest.fn(),
    syncSource: jest.fn(),
    removeSource: jest.fn(),
    nextRunBySource: jest.fn(async () => new Map<string, number>()),
  } as unknown as JobSyncScheduler;

  const service = new JobSyncService(sources, runs, jobs, client, scheduler);
  return { service, runsSave, sourcesUpdate, ingest, search, runsCount, sourcesFindOne };
}

describe("JobSyncService.executeRun", () => {
  it("tallies created/updated/found distinct and marks success", async () => {
    const m = setup();
    m.search.mockImplementation(
      async ({ query, page }: { query: string; page: number }) => {
        if (page > 0) return { nbPages: 1, nbHits: 0, items: [] };
        if (query === "q1")
          return {
            nbPages: 1,
            nbHits: 2,
            items: [
              { jobId: 1, jobTitle: "A" },
              { jobId: 2, jobTitle: "B" },
            ],
          };
        return {
          nbPages: 1,
          nbHits: 2,
          items: [
            { jobId: 1, jobTitle: "A" }, // trùng với q1
            { jobId: 3, jobTitle: "C" },
          ],
        };
      },
    );

    const source = makeSource();
    const run = makeRun();
    await m.service.executeRun(source, run);

    expect(run.status).toBe("success");
    expect(run.jobsFound).toBe(3); // vnw_1, vnw_2, vnw_3
    expect(run.jobsCreated).toBe(3);
    expect(run.jobsUpdated).toBe(1); // vnw_1 lần thứ hai
    expect(run.jobsFailed).toBe(0);
    expect(run.pagesFetched).toBe(2); // mỗi từ khóa 1 trang
    expect(m.sourcesUpdate).toHaveBeenCalledWith(
      { id: "src-1" },
      expect.objectContaining({ lastStatus: "success" }),
    );
  });

  it("caps pages at nbPages even when maxPages is higher", async () => {
    const m = setup();
    m.search.mockResolvedValue({
      nbPages: 1,
      nbHits: 1,
      items: [{ jobId: 1, jobTitle: "A" }],
    });
    const source = makeSource({ queries: ["only"], maxPages: 5 });
    await m.service.executeRun(source, makeRun());
    // 1 từ khóa, nbPages=1 → chỉ gọi search đúng một lần dù maxPages=5.
    expect(m.search).toHaveBeenCalledTimes(1);
  });

  it("records partial status when one query throws but others ingest", async () => {
    const m = setup();
    m.search.mockImplementation(async ({ query }: { query: string }) => {
      if (query === "q2") throw new Error("boom");
      return { nbPages: 1, nbHits: 1, items: [{ jobId: 1, jobTitle: "A" }] };
    });
    const run = makeRun();
    await m.service.executeRun(makeSource(), run);
    expect(run.status).toBe("partial");
    expect(run.jobsCreated).toBe(1);
    expect(run.errorMessage).toBe("boom");
  });

  it("counts unmappable items as failed and marks partial", async () => {
    const m = setup();
    m.search.mockImplementation(async ({ query }: { query: string }) =>
      query === "q1"
        ? {
            nbPages: 1,
            nbHits: 2,
            items: [
              { jobId: 1, jobTitle: "A" },
              { jobId: 2 }, // thiếu title → map null → failed
            ],
          }
        : { nbPages: 1, nbHits: 0, items: [] },
    );
    const run = makeRun();
    await m.service.executeRun(makeSource(), run);
    expect(run.jobsFailed).toBe(1);
    expect(run.jobsCreated).toBe(1);
    expect(run.status).toBe("partial");
  });
});

describe("JobSyncService.runNow guard", () => {
  it("rejects when a run is already in progress", async () => {
    const m = setup();
    m.runsCount.mockResolvedValue(1); // có run đang chạy
    await expect(m.service.runNow("src-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
