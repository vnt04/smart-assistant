// Mỗi mention ghi chú được serialize thành
//   <span data-note-mention data-note-id="<uuid>">@Tiêu đề</span>
// nên chỉ cần bóc giá trị data-note-id là đủ — không cần parse cả cây HTML.
const NOTE_ID_RX =
  /data-note-id="([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"/g;

/**
 * Trích danh sách note id được mention (liên kết nội bộ) từ HTML nội dung ghi chú.
 * Trả về các id duy nhất (chuẩn hoá lowercase), giữ nguyên thứ tự xuất hiện.
 */
export function extractNoteRefIds(html: string): string[] {
  if (!html) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(NOTE_ID_RX)) {
    const id = match[1].toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
