import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Repository } from "typeorm";
import type { UsersService } from "../users/users.service";
import type { NoteEntity } from "./entities/note.entity";
import type { NotebookEntity } from "./entities/notebook.entity";
import type { ShareEntity } from "./entities/share.entity";
import type { ShareInviteEntity } from "./entities/share-invite.entity";
import type { NotebooksService } from "./notebooks.service";
import { SharesService } from "./shares.service";

const OWNER = "11111111-1111-1111-1111-111111111111";
const NOTE_ID = "33333333-3333-3333-3333-333333333333";
const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz";

interface Mocks {
  shares?: Partial<Repository<ShareEntity>>;
  invites?: Partial<Repository<ShareInviteEntity>>;
  notesRepo?: Partial<Repository<NoteEntity>>;
  notebooksRepo?: Partial<Repository<NotebookEntity>>;
  notebooks?: Partial<NotebooksService>;
  users?: Partial<UsersService>;
}

function makeService(m: Mocks): SharesService {
  return new SharesService(
    (m.shares ?? {}) as Repository<ShareEntity>,
    (m.invites ?? {}) as Repository<ShareInviteEntity>,
    (m.notesRepo ?? {}) as Repository<NoteEntity>,
    (m.notebooksRepo ?? {}) as Repository<NotebookEntity>,
    (m.notebooks ?? {}) as NotebooksService,
    (m.users ?? {}) as UsersService,
  );
}

function noteEntity(over: Partial<NoteEntity> = {}): NoteEntity {
  return {
    id: NOTE_ID,
    userId: OWNER,
    notebookId: null,
    title: "Ghi chú A",
    contentHtml: "<p>nội dung</p>",
    contentText: "nội dung",
    isPinned: false,
    isLocked: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...over,
  } as NoteEntity;
}

function shareEntity(over: Partial<ShareEntity> = {}): ShareEntity {
  return {
    id: "share-1",
    ownerUserId: OWNER,
    resourceType: "note",
    resourceId: NOTE_ID,
    token: TOKEN,
    linkAccess: "none",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  } as ShareEntity;
}

const noLockedNotebooks = {
  lockedNotebookIds: jest.fn().mockResolvedValue(new Set<string>()),
};

describe("SharesService.resolve — phân quyền truy cập", () => {
  it("link công khai (view) cho phép xem note mà không cần đăng nhập", async () => {
    // Arrange
    const svc = makeService({
      shares: {
        findOne: jest.fn().mockResolvedValue(shareEntity({ linkAccess: "view" })),
      },
      notesRepo: { findOne: jest.fn().mockResolvedValue(noteEntity()) },
      notebooks: noLockedNotebooks,
      users: { findById: jest.fn().mockResolvedValue({ name: "Nghiệp" }) },
    });

    // Act
    const result = await svc.resolve(TOKEN, null);

    // Assert
    expect(result.resourceType).toBe("note");
    if (result.resourceType === "note") {
      expect(result.note.title).toBe("Ghi chú A");
      expect(result.note.contentHtml).toContain("nội dung");
      expect(result.ownerName).toBe("Nghiệp");
    }
  });

  it("token không tồn tại → NotFound", async () => {
    const svc = makeService({
      shares: { findOne: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.resolve("khong-ton-tai-token-1234567890", null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("share theo email + chưa đăng nhập → yêu cầu đăng nhập (401)", async () => {
    const svc = makeService({
      shares: {
        findOne: jest.fn().mockResolvedValue(shareEntity({ linkAccess: "none" })),
      },
      invites: {
        find: jest.fn().mockResolvedValue([{ email: "ban@example.com" }]),
      },
    });
    await expect(svc.resolve(TOKEN, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("share theo email + sai email → cấm (403)", async () => {
    const svc = makeService({
      shares: {
        findOne: jest.fn().mockResolvedValue(shareEntity({ linkAccess: "none" })),
      },
      invites: {
        find: jest.fn().mockResolvedValue([{ email: "ban@example.com" }]),
      },
    });
    await expect(
      svc.resolve(TOKEN, "nguoila@example.com"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("share theo email + đúng email (không phân biệt hoa thường) → xem được", async () => {
    const svc = makeService({
      shares: {
        findOne: jest.fn().mockResolvedValue(shareEntity({ linkAccess: "none" })),
      },
      invites: {
        find: jest.fn().mockResolvedValue([{ email: "ban@example.com" }]),
      },
      notesRepo: { findOne: jest.fn().mockResolvedValue(noteEntity()) },
      notebooks: noLockedNotebooks,
      users: { findById: jest.fn().mockResolvedValue({ name: "Nghiệp" }) },
    });
    const result = await svc.resolve(TOKEN, "BAN@example.com");
    expect(result.resourceType).toBe("note");
  });

  it("note đang khóa → ẩn (NotFound) dù link công khai đang bật", async () => {
    const svc = makeService({
      shares: {
        findOne: jest.fn().mockResolvedValue(shareEntity({ linkAccess: "view" })),
      },
      notesRepo: {
        findOne: jest.fn().mockResolvedValue(noteEntity({ isLocked: true })),
      },
      notebooks: noLockedNotebooks,
      users: { findById: jest.fn().mockResolvedValue({ name: "Nghiệp" }) },
    });
    await expect(svc.resolve(TOKEN, null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("SharesService.setLink — chặn khi đang khóa", () => {
  it("bật link 'view' cho note đang khóa → BadRequest (share_locked)", async () => {
    // assertOwnership đọc {id}, sau đó isNoteLockedById đọc {id,isLocked,notebookId}
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({ id: NOTE_ID })
      .mockResolvedValueOnce({ id: NOTE_ID, isLocked: true, notebookId: null });
    const svc = makeService({ notesRepo: { findOne } });
    await expect(
      svc.setLink(OWNER, "note", NOTE_ID, "view"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
