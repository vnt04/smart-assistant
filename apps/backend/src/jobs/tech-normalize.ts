/**
 * Chuẩn hóa tên công nghệ thành cặp `{ slug, name }`.
 *
 * `slug` là khóa hợp nhất các biến thể ("React", "react", "ReactJS" → `react`)
 * và là giá trị dùng để lọc/đếm facet. `name` là nhãn hiển thị (bản gốc đã trim
 * của lần đầu gặp slug đó).
 *
 * Lưu ý quan trọng: KHÔNG dùng slug "đập phẳng" thông thường (thay mọi ký tự
 * không phải chữ-số bằng "-"), vì nó sẽ gộp nhầm `C`, `C++`, `C#` thành cùng một
 * slug `c`. Ta giữ lại `+ # .` để phân biệt các ngôn ngữ này.
 */

/** Khớp cột `technologies.slug` / `technologies.name` (VARCHAR(64)). */
export const MAX_TECH_SLUG_LENGTH = 64;

/** Cặp công nghệ đã chuẩn hóa, sẵn sàng upsert. */
export interface NormalizedTech {
  slug: string;
  name: string;
}

/**
 * Hợp nhất các biến thể về một slug chuẩn. Chỉ liệt kê những trường hợp hay gặp
 * và dễ lệch; danh sách này có thể mở rộng dần. Khóa là slug-thô (sau khi
 * `baseSlug`), giá trị là slug chuẩn cuối cùng.
 */
const SLUG_ALIASES: Record<string, string> = {
  reactjs: "react",
  "react.js": "react",
  nodejs: "node.js",
  "node-js": "node.js",
  node: "node.js",
  vuejs: "vue",
  "vue.js": "vue",
  nextjs: "next.js",
  nestjs: "nest.js",
  expressjs: "express",
  golang: "go",
  js: "javascript",
  ts: "typescript",
  k8s: "kubernetes",
  postgres: "postgresql",
  postgre: "postgresql",
  "c-sharp": "c#",
  csharp: "c#",
  "c-plus-plus": "c++",
  cpp: "c++",
};

/**
 * Tạo slug thô: thường hóa, bỏ dấu tiếng Việt, gom khoảng trắng thành "-", và
 * CHỈ giữ `a-z 0-9 + # . -`. Đây là đầu vào cho bảng alias.
 */
function baseSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9+#.\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, MAX_TECH_SLUG_LENGTH);
}

/** Slug chuẩn của một tên công nghệ (đã áp alias); rỗng nếu tên là rác. */
export function slugifyTech(raw: string): string {
  const base = baseSlug(raw);
  // Phải có ít nhất một ký tự chữ-số; "###", "++", "..." là rác → bỏ.
  // (giữ "c#", "c++", "node.js" vì chúng có chữ-số).
  if (base === "" || !/[a-z0-9]/.test(base)) return "";
  return (SLUG_ALIASES[base] ?? base).slice(0, MAX_TECH_SLUG_LENGTH);
}

/**
 * Chuẩn hóa một danh sách tên công nghệ:
 * - bỏ entry rỗng/rác (slug rỗng),
 * - khử trùng lặp theo slug (giữ tên hiển thị của lần đầu gặp),
 * - giữ nguyên thứ tự xuất hiện.
 */
export function normalizeTechList(names: readonly string[]): NormalizedTech[] {
  const bySlug = new Map<string, NormalizedTech>();
  for (const raw of names) {
    const slug = slugifyTech(raw);
    if (slug === "") continue;
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, { slug, name: raw.trim().slice(0, MAX_TECH_SLUG_LENGTH) });
  }
  return [...bySlug.values()];
}
