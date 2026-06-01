import type { Notebook } from "@assistant/shared";

/**
 * Tính "khóa hiệu lực" (effective lock) phía client từ cây notebook.
 *
 * Server chỉ trả cờ khóa RIÊNG (`isLocked`) của từng note/notebook; trạng thái
 * khóa lan xuống (cascade) được suy ra bằng cách đi ngược chuỗi `parentId` —
 * giống pattern `expandAncestors` trong notes-explorer. Frontend dùng kết quả
 * này để hiện icon ổ khóa và quyết định có chặn mở note hay không. Server vẫn
 * enforce độc lập (ẩn excerpt / strip content), đây chỉ là tín hiệu UX.
 */

/** Một notebook tổ tiên bất kỳ (kể cả chính nó) có cờ khóa? */
export function isNotebookEffectivelyLocked(
  notebookId: string | null,
  notebooksById: Map<string, Notebook>,
): boolean {
  let cursor = notebookId;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor)) break; // phòng dữ liệu vòng lặp
    seen.add(cursor);
    const nb = notebooksById.get(cursor);
    if (!nb) break;
    if (nb.isLocked) return true;
    cursor = nb.parentId;
  }
  return false;
}

/** Note bị khóa hiệu lực nếu cờ riêng bật, hoặc notebook tổ tiên bị khóa. */
export function isNoteEffectivelyLocked(
  note: { isLocked: boolean; notebookId: string | null },
  notebooksById: Map<string, Notebook>,
): boolean {
  if (note.isLocked) return true;
  return isNotebookEffectivelyLocked(note.notebookId, notebooksById);
}

export function notebooksById(
  notebooks: ReadonlyArray<Notebook>,
): Map<string, Notebook> {
  return new Map(notebooks.map((nb) => [nb.id, nb]));
}
