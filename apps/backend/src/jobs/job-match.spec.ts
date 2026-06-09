import {
  DEFAULT_JOB_MATCH_PROFILE,
  scoreJob,
  type Job,
  type JobMatchProfile,
  type JobMatchWeights,
} from "@assistant/shared";

/** Thời điểm cố định để test độ mới ổn định. */
const NOW = Date.parse("2026-06-10T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const ZERO_WEIGHTS: JobMatchWeights = {
  tech: 0,
  salary: 0,
  level: 0,
  employmentType: 0,
  location: 0,
  freshness: 0,
  keyword: 0,
};

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    jobId: "1",
    jobUrl: "",
    source: "linkedin",
    title: "Backend Engineer",
    company: "Acme",
    companyLogo: "",
    location: "Hà Nội",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "VND",
    level: null,
    employmentType: null,
    postedAt: null,
    deadline: null,
    applicants: null,
    techStack: [],
    techSlugs: [],
    requirements: [],
    responsibilities: [],
    benefits: [],
    description: "",
    fitScore: 0,
    fitReason: null,
    crawlAt: new Date(NOW).toISOString(),
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<JobMatchProfile> = {}): JobMatchProfile {
  return {
    ...DEFAULT_JOB_MATCH_PROFILE,
    enabled: true,
    ...overrides,
    weights: { ...ZERO_WEIGHTS, ...(overrides.weights ?? {}) },
  };
}

describe("scoreJob", () => {
  it("chấm độ mới: job mới điểm cao hơn job cũ", () => {
    // Arrange
    const profile = makeProfile({ weights: { ...ZERO_WEIGHTS, freshness: 10 } });
    const fresh = makeJob({ crawlAt: new Date(NOW).toISOString() });
    const old = makeJob({ crawlAt: new Date(NOW - 60 * DAY).toISOString() });

    // Act
    const a = scoreJob(fresh, profile, NOW);
    const b = scoreJob(old, profile, NOW);

    // Assert
    expect(a.score).toBe(100);
    expect(b.score).toBeLessThan(20);
    expect(a.tier).toBe("excellent");
  });

  it("chấm kỹ năng theo tỉ lệ khớp và trả về matchedTechs", () => {
    // Arrange
    const profile = makeProfile({
      weights: { ...ZERO_WEIGHTS, tech: 10 },
      preferredTechs: ["react", "typescript"],
    });
    const job = makeJob({ techSlugs: ["react", "node.js"] });

    // Act
    const result = scoreJob(job, profile, NOW);

    // Assert
    expect(result.score).toBe(50); // 1/2 kỹ năng khớp
    expect(result.matchedTechs).toEqual(["react"]);
  });

  it("nội suy lương giữa sàn và mức mong muốn", () => {
    // Arrange
    const profile = makeProfile({
      weights: { ...ZERO_WEIGHTS, salary: 10 },
      desiredSalary: 30_000_000,
      minSalary: 10_000_000,
    });

    // Act
    const full = scoreJob(makeJob({ salaryMax: 30_000_000 }), profile, NOW);
    const half = scoreJob(makeJob({ salaryMax: 20_000_000 }), profile, NOW);
    const below = scoreJob(makeJob({ salaryMax: 5_000_000 }), profile, NOW);
    const negotiable = scoreJob(makeJob({ salaryMax: null }), profile, NOW);

    // Assert
    expect(full.score).toBe(100);
    expect(half.score).toBe(50);
    expect(below.score).toBe(0);
    expect(negotiable.score).toBe(50); // Thỏa thuận → trung tính
  });

  it("trừ điểm khi job chứa công nghệ né tránh", () => {
    // Arrange
    const profile = makeProfile({
      weights: { ...ZERO_WEIGHTS, freshness: 10 },
      avoidTechs: ["php"],
    });
    const clean = makeJob({ techSlugs: ["go"] });
    const dirty = makeJob({ techSlugs: ["php"] });

    // Act
    const a = scoreJob(clean, profile, NOW);
    const b = scoreJob(dirty, profile, NOW);

    // Assert
    expect(a.score - b.score).toBe(12);
    expect(b.breakdown.some((x) => x.key === "avoid")).toBe(true);
  });

  it("ẩn job thiếu công nghệ bắt buộc", () => {
    // Arrange
    const profile = makeProfile({
      weights: { ...ZERO_WEIGHTS, freshness: 10 },
      hideMissingMustHave: true,
      mustHaveTechs: ["go"],
    });

    // Act
    const hasGo = scoreJob(makeJob({ techSlugs: ["go", "react"] }), profile, NOW);
    const noGo = scoreJob(makeJob({ techSlugs: ["react"] }), profile, NOW);

    // Assert
    expect(hasGo.hidden).toBe(false);
    expect(noGo.hidden).toBe(true);
  });

  it("ẩn job dưới ngưỡng điểm tối thiểu", () => {
    // Arrange
    const profile = makeProfile({
      weights: { ...ZERO_WEIGHTS, tech: 10 },
      preferredTechs: ["a", "b"],
      minScore: 60,
    });

    // Act
    const low = scoreJob(makeJob({ techSlugs: [] }), profile, NOW);
    const high = scoreJob(makeJob({ techSlugs: ["a", "b"] }), profile, NOW);

    // Assert
    expect(low.score).toBe(0);
    expect(low.hidden).toBe(true);
    expect(high.hidden).toBe(false);
  });

  it("không tính tiêu chí chưa cấu hình (dữ liệu thiếu không bị dìm)", () => {
    // Arrange: chỉ bật trọng số kỹ năng nhưng chưa chọn kỹ năng nào → không có
    // tiêu chí nào áp dụng → điểm 0, không có breakdown.
    const profile = makeProfile({ weights: { ...ZERO_WEIGHTS, tech: 10 } });

    // Act
    const result = scoreJob(makeJob(), profile, NOW);

    // Assert
    expect(result.score).toBe(0);
    expect(result.breakdown).toHaveLength(0);
  });
});
