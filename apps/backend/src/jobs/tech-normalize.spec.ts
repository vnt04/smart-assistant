import { normalizeTechList, slugifyTech } from "./tech-normalize";

describe("slugifyTech", () => {
  it("thường hóa và trim", () => {
    expect(slugifyTech("  React  ")).toBe("react");
    expect(slugifyTech("TypeScript")).toBe("typescript");
  });

  it("KHÔNG gộp nhầm C / C++ / C# (giữ + và #)", () => {
    expect(slugifyTech("C")).toBe("c");
    expect(slugifyTech("C++")).toBe("c++");
    expect(slugifyTech("C#")).toBe("c#");
  });

  it("hợp nhất các biến thể qua alias", () => {
    expect(slugifyTech("ReactJS")).toBe("react");
    expect(slugifyTech("React.js")).toBe("react");
    expect(slugifyTech("golang")).toBe("go");
    expect(slugifyTech("NodeJS")).toBe("node.js");
    expect(slugifyTech("k8s")).toBe("kubernetes");
    expect(slugifyTech("csharp")).toBe("c#");
  });

  it("bỏ dấu tiếng Việt", () => {
    expect(slugifyTech("Lập trình")).toBe("lap-trinh");
  });

  it("gom khoảng trắng thành một dấu nối", () => {
    expect(slugifyTech("Spring   Boot")).toBe("spring-boot");
  });

  it("trả rỗng cho rác / chuỗi rỗng", () => {
    expect(slugifyTech("")).toBe("");
    expect(slugifyTech("   ")).toBe("");
    expect(slugifyTech("!!!")).toBe("");
  });

  it("cắt slug tối đa 64 ký tự", () => {
    expect(slugifyTech("a".repeat(100))).toHaveLength(64);
  });
});

describe("normalizeTechList", () => {
  it("khử trùng lặp theo slug, giữ tên hiển thị lần đầu gặp", () => {
    const result = normalizeTechList(["React", "react", "ReactJS"]);
    expect(result).toEqual([{ slug: "react", name: "React" }]);
  });

  it("giữ nguyên thứ tự xuất hiện", () => {
    const result = normalizeTechList(["Go", "TypeScript", "React"]);
    expect(result.map((t) => t.slug)).toEqual(["go", "typescript", "react"]);
  });

  it("loại bỏ entry rác", () => {
    const result = normalizeTechList(["React", "", "  ", "###"]);
    expect(result.map((t) => t.slug)).toEqual(["react"]);
  });

  it("phân biệt C, C++, C# thành ba mục", () => {
    const result = normalizeTechList(["C", "C++", "C#"]);
    expect(result.map((t) => t.slug)).toEqual(["c", "c++", "c#"]);
  });

  it("trả mảng rỗng cho danh sách rỗng", () => {
    expect(normalizeTechList([])).toEqual([]);
  });
});
