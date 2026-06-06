import { extractNoteRefIds } from "./extract-note-refs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("extractNoteRefIds", () => {
  it("trả mảng rỗng khi HTML rỗng", () => {
    expect(extractNoteRefIds("")).toEqual([]);
  });

  it("trả mảng rỗng khi không có mention nào", () => {
    expect(extractNoteRefIds("<p>chỉ là văn bản thường</p>")).toEqual([]);
  });

  it("bóc một id từ mention", () => {
    const html = `<p>xem <span data-note-mention data-note-id="${A}">@Ghi chú A</span></p>`;
    expect(extractNoteRefIds(html)).toEqual([A]);
  });

  it("bóc nhiều id theo thứ tự xuất hiện", () => {
    const html = `<span data-note-mention data-note-id="${B}">@B</span><span data-note-mention data-note-id="${A}">@A</span>`;
    expect(extractNoteRefIds(html)).toEqual([B, A]);
  });

  it("loại bỏ id trùng lặp, giữ lần xuất hiện đầu", () => {
    const html = `<span data-note-id="${A}"></span><span data-note-id="${A}"></span>`;
    expect(extractNoteRefIds(html)).toEqual([A]);
  });

  it("chuẩn hoá id về lowercase", () => {
    const html = `<span data-note-id="${A.toUpperCase()}"></span>`;
    expect(extractNoteRefIds(html)).toEqual([A]);
  });

  it("bỏ qua giá trị không phải UUID hợp lệ", () => {
    const html = `<span data-note-id="not-a-uuid"></span>`;
    expect(extractNoteRefIds(html)).toEqual([]);
  });
});
