import type { Repository } from "typeorm";
import { SettingsService } from "../settings/settings.service";
import { NotebookEntity } from "./entities/notebook.entity";
import { ShareEntity } from "./entities/share.entity";
import { NotebooksService } from "./notebooks.service";

const USER_ID = "22222222-2222-2222-2222-222222222222";

type Row = Pick<NotebookEntity, "id" | "parentId" | "isLocked">;

function makeService(rows: Row[]): NotebooksService {
  const repo = {
    find: jest.fn().mockResolvedValue(rows),
  } as unknown as Repository<NotebookEntity>;
  const shares = {} as unknown as Repository<ShareEntity>;
  const settings = {} as SettingsService;
  return new NotebooksService(repo, shares, settings);
}

describe("NotebooksService.lockedNotebookIds", () => {
  it("khóa lan xuống toàn bộ con cháu (cascade)", async () => {
    // A(locked) → B → C ; D → E(locked) → F ; G
    const svc = makeService([
      { id: "A", parentId: null, isLocked: true },
      { id: "B", parentId: "A", isLocked: false },
      { id: "C", parentId: "B", isLocked: false },
      { id: "D", parentId: null, isLocked: false },
      { id: "E", parentId: "D", isLocked: true },
      { id: "F", parentId: "E", isLocked: false },
      { id: "G", parentId: null, isLocked: false },
    ]);
    const locked = await svc.lockedNotebookIds(USER_ID);
    expect([...locked].sort()).toEqual(["A", "B", "C", "E", "F"]);
    expect(locked.has("D")).toBe(false);
    expect(locked.has("G")).toBe(false);
  });

  it("trả tập rỗng khi không có notebook nào bị khóa", async () => {
    const svc = makeService([
      { id: "A", parentId: null, isLocked: false },
      { id: "B", parentId: "A", isLocked: false },
    ]);
    const locked = await svc.lockedNotebookIds(USER_ID);
    expect(locked.size).toBe(0);
  });
});
