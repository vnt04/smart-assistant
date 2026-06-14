import { ingestJobInputSchema } from "@assistant/shared";
import {
  decodeHtmlEntities,
  htmlToBullets,
  htmlToText,
  mapVietnamworksJob,
} from "./vietnamworks.mapper";

/** Một job thô rút gọn từ response thật của VietnamWorks. */
const SAMPLE = {
  jobId: 2056771,
  jobTitle: "RPA Developer",
  jobUrl: "https://www.vietnamworks.com/rpa-developer--2056771-jv",
  companyLogo: "https://images.vietnamworks.com/pictureofcompany/ff/11128530.png",
  companyName: "Hansae HCM Co., Ltd",
  approvedOn: "2026-05-21T10:42:45+07:00",
  onlineOn: "2026-06-14T11:00:00+07:00",
  createdOn: "2026-05-21T10:19:12+07:00",
  expiredOn: "2026-06-20T23:59:59+07:00",
  jobDescription:
    "<p>- Design, develop, and maintain RPA workflows in UIPath</p>" +
    "<p>- Build fault tolerant automation processes outside of UIPath</p>",
  jobRequirement:
    "<p>- At least 1 year of experience with RPA</p>" +
    "<p>- Working knowledge with any of the following languages : Java, C&#43;&#43;, .NET, Python</p>",
  jobLevel: "Experienced (non-manager)",
  jobLevelVI: "Nhân viên",
  typeWorkingId: 1,
  salary: 0,
  salaryMin: 0,
  salaryMax: 0,
  salaryCurrency: "USD",
  numOfApplications: 0,
  skills: [
    { skillId: 1012812, skillName: "RPA" },
    { skillId: 1007531, skillName: "UI Path" },
    { skillId: 285, skillName: "C++" },
  ],
  benefits: [
    { benefitId: 1, benefitNameVI: "Thưởng", benefitValue: "13th month salary" },
    { benefitId: 3, benefitNameVI: "Nghỉ phép có lương", benefitValue: "" },
  ],
  workingLocations: [
    {
      cityId: 29,
      districtId: 1,
      address: "138 Hai Bà Trưng, Quận 1, Ho Chi Minh City",
      cityName: "Ho Chi Minh",
      cityNameVI: "Hồ Chí Minh",
    },
  ],
  address: "Phòng 12A02, 138 Hai Bà Trưng, Phường Đa Kao, Quận 1",
};

describe("mapVietnamworksJob", () => {
  it("maps core fields and prefixes jobId with vnw_", () => {
    const mapped = mapVietnamworksJob(SAMPLE);
    expect(mapped).not.toBeNull();
    expect(mapped?.jobId).toBe("vnw_2056771");
    expect(mapped?.source).toBe("vietnamworks");
    expect(mapped?.title).toBe("RPA Developer");
    expect(mapped?.company).toBe("Hansae HCM Co., Ltd");
    expect(mapped?.location).toBe("Hồ Chí Minh");
    expect(mapped?.level).toBe("Nhân viên");
    expect(mapped?.employmentType).toBe("Toàn thời gian");
  });

  it("treats hidden salary (0) as null and drops currency", () => {
    const mapped = mapVietnamworksJob(SAMPLE);
    expect(mapped?.salaryMin).toBeNull();
    expect(mapped?.salaryMax).toBeNull();
    expect(mapped?.salaryCurrency).toBeNull();
  });

  it("keeps a real salary with its currency", () => {
    const mapped = mapVietnamworksJob({
      ...SAMPLE,
      salaryMin: 1000,
      salaryMax: 2000,
    });
    expect(mapped?.salaryMin).toBe(1000);
    expect(mapped?.salaryMax).toBe(2000);
    expect(mapped?.salaryCurrency).toBe("USD");
  });

  it("extracts skills, requirement bullets (decoding entities) and benefits", () => {
    const mapped = mapVietnamworksJob(SAMPLE);
    expect(mapped?.techStack).toEqual(["RPA", "UI Path", "C++"]);
    expect(mapped?.requirements).toEqual([
      "At least 1 year of experience with RPA",
      "Working knowledge with any of the following languages : Java, C++, .NET, Python",
    ]);
    expect(mapped?.responsibilities).toEqual([
      "Design, develop, and maintain RPA workflows in UIPath",
      "Build fault tolerant automation processes outside of UIPath",
    ]);
    expect(mapped?.benefits).toEqual([
      "Thưởng: 13th month salary",
      "Nghỉ phép có lương",
    ]);
  });

  it("maps dates and null applicants when count is 0", () => {
    const mapped = mapVietnamworksJob(SAMPLE);
    expect(mapped?.postedAt).toBe("2026-05-21T10:42:45+07:00");
    expect(mapped?.deadline).toBe("2026-06-20T23:59:59+07:00");
    expect(mapped?.applicants).toBeNull();
  });

  it("labels applicants when count > 0", () => {
    const mapped = mapVietnamworksJob({ ...SAMPLE, numOfApplications: 7 });
    expect(mapped?.applicants).toBe("7 ứng viên");
  });

  it("returns null when jobId or title is missing", () => {
    expect(mapVietnamworksJob({ ...SAMPLE, jobId: undefined })).toBeNull();
    expect(mapVietnamworksJob({ ...SAMPLE, jobTitle: "" })).toBeNull();
    expect(mapVietnamworksJob(null)).toBeNull();
    expect(mapVietnamworksJob("nope")).toBeNull();
  });

  it("produces an object that passes ingestJobInputSchema", () => {
    const mapped = mapVietnamworksJob(SAMPLE);
    const parsed = ingestJobInputSchema.parse(mapped);
    expect(parsed.jobId).toBe("vnw_2056771");
    expect(parsed.title).toBe("RPA Developer");
    expect(parsed.salaryMin).toBeNull();
    expect(parsed.techStack).toContain("C++");
  });

  it("falls back to address when no city name is present", () => {
    const mapped = mapVietnamworksJob({
      ...SAMPLE,
      workingLocations: [{ address: "12 Đường ABC" }],
    });
    expect(mapped?.location).toBe("12 Đường ABC");
  });
});

describe("html helpers", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeHtmlEntities("C&#43;&#43; &amp; .NET")).toBe("C++ & .NET");
    expect(decodeHtmlEntities("a&#x2B;b")).toBe("a+b");
    expect(decodeHtmlEntities("&quot;x&quot;&nbsp;y")).toBe('"x" y');
  });

  it("converts block HTML to newline-separated text", () => {
    expect(htmlToText("<p>Một</p><p>Hai</p>")).toBe("Một\nHai");
    expect(htmlToText("Dòng 1<br/>Dòng 2")).toBe("Dòng 1\nDòng 2");
    expect(htmlToText("")).toBe("");
  });

  it("strips bullet markers and drops empties", () => {
    expect(htmlToBullets("<ul><li>• A</li><li>- B</li><li></li></ul>")).toEqual([
      "A",
      "B",
    ]);
  });
});
