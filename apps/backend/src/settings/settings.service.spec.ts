import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { Repository } from "typeorm";
import { CryptoService } from "../common/crypto/crypto.service";
import { SettingsService } from "./settings.service";
import { UserSettingsEntity } from "./user-settings.entity";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function makeEntity(
  notesLockHash: string | null,
): UserSettingsEntity {
  return {
    userId: USER_ID,
    aiProvider: "claude",
    aiApiKeyEnc: null,
    telegramBotTokenEnc: null,
    telegramChatId: null,
    theme: "system",
    defaultWalletId: null,
    notesLockHash,
    updatedAt: new Date(),
  } as UserSettingsEntity;
}

interface MockRepo {
  repo: Repository<UserSettingsEntity>;
  query: jest.Mock;
  entity: UserSettingsEntity;
}

function makeService(notesLockHash: string | null): {
  svc: SettingsService;
  mock: MockRepo;
} {
  const entity = makeEntity(notesLockHash);
  const query = jest.fn().mockResolvedValue(undefined);
  const repo = {
    findOne: jest.fn().mockResolvedValue(entity),
    save: jest.fn().mockImplementation(async (e: UserSettingsEntity) => e),
    create: jest.fn().mockImplementation((e: UserSettingsEntity) => e),
    manager: { query },
  } as unknown as Repository<UserSettingsEntity>;
  const crypto = {} as CryptoService; // toDto không gọi crypto khi enc fields null
  return { svc: new SettingsService(repo, crypto), mock: { repo, query, entity } };
}

describe("SettingsService — notes lock", () => {
  it("hasNotesLock reflects stored hash", async () => {
    const withLock = makeService(bcrypt.hashSync("secret", 4));
    const without = makeService(null);
    await expect(withLock.svc.hasNotesLock(USER_ID)).resolves.toBe(true);
    await expect(without.svc.hasNotesLock(USER_ID)).resolves.toBe(false);
  });

  it("setNotesLock (lần đầu) lưu hash và không lộ hash trong DTO", async () => {
    const { svc, mock } = makeService(null);
    const dto = await svc.setNotesLock(USER_ID, { newPassword: "1234" });
    expect(mock.entity.notesLockHash).toBeTruthy();
    expect(bcrypt.compareSync("1234", mock.entity.notesLockHash as string)).toBe(
      true,
    );
    expect(dto.hasNotesLock).toBe(true);
    expect(dto as Record<string, unknown>).not.toHaveProperty("notesLockHash");
  });

  it("setNotesLock (đổi) yêu cầu currentPassword đúng", async () => {
    const { svc, mock } = makeService(bcrypt.hashSync("old", 4));
    await svc.setNotesLock(USER_ID, {
      currentPassword: "old",
      newPassword: "new-pass",
    });
    expect(
      bcrypt.compareSync("new-pass", mock.entity.notesLockHash as string),
    ).toBe(true);
  });

  it("setNotesLock (đổi) từ chối currentPassword sai", async () => {
    const { svc } = makeService(bcrypt.hashSync("old", 4));
    await expect(
      svc.setNotesLock(USER_ID, {
        currentPassword: "wrong",
        newPassword: "new-pass",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("verifyNotesLock đúng/sai", async () => {
    const { svc } = makeService(bcrypt.hashSync("pw", 4));
    await expect(svc.verifyNotesLock(USER_ID, "pw")).resolves.toBe(true);
    await expect(svc.verifyNotesLock(USER_ID, "nope")).resolves.toBe(false);
  });

  it("requireNotesLock ném 401 khi sai", async () => {
    const { svc } = makeService(bcrypt.hashSync("pw", 4));
    await expect(svc.requireNotesLock(USER_ID, "bad")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("clearNotesLock xóa hash và mở khóa toàn bộ note/notebook", async () => {
    const { svc, mock } = makeService(bcrypt.hashSync("pw", 4));
    const dto = await svc.clearNotesLock(USER_ID, "pw");
    expect(mock.entity.notesLockHash).toBeNull();
    expect(dto.hasNotesLock).toBe(false);
    // Hai lệnh UPDATE: notes + notebooks
    expect(mock.query).toHaveBeenCalledTimes(2);
    const statements = mock.query.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /UPDATE notes/i.test(s))).toBe(true);
    expect(statements.some((s) => /UPDATE notebooks/i.test(s))).toBe(true);
  });

  it("clearNotesLock với mật khẩu sai không đụng tới note/notebook", async () => {
    const { svc, mock } = makeService(bcrypt.hashSync("pw", 4));
    await expect(svc.clearNotesLock(USER_ID, "bad")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mock.query).not.toHaveBeenCalled();
    expect(mock.entity.notesLockHash).not.toBeNull();
  });
});
