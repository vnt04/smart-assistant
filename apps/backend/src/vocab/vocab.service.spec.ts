import { BadRequestException } from "@nestjs/common";
import type { Repository } from "typeorm";
import { VocabService } from "./vocab.service";
import { VocabItemEntity } from "./entities/vocab-item.entity";

type Where = Partial<Record<keyof VocabItemEntity, unknown>>;

/** Minimal in-memory stand-in for the TypeORM repository used by VocabService. */
function makeRepo(seed: VocabItemEntity[] = []) {
  const rows: VocabItemEntity[] = [...seed];
  let seq = seed.length;
  const matches = (row: VocabItemEntity, where: Where): boolean =>
    Object.entries(where).every(
      ([k, v]) => (row as unknown as Record<string, unknown>)[k] === v,
    );

  return {
    rows,
    async findOne({ where }: { where: Where }) {
      return rows.find((r) => matches(r, where)) ?? null;
    },
    async findOneOrFail({ where }: { where: Where }) {
      const r = rows.find((row) => matches(row, where));
      if (!r) throw new Error("not found");
      return r;
    },
    create(partial: Partial<VocabItemEntity>) {
      return { ...partial } as VocabItemEntity;
    },
    async save(entity: VocabItemEntity) {
      const saved = { ...entity, id: entity.id ?? `id-${++seq}` };
      rows.push(saved);
      return saved;
    },
    async increment(where: Where, prop: keyof VocabItemEntity, by: number) {
      const r = rows.find((row) => matches(row, where));
      if (r) (r as unknown as Record<string, number>)[prop as string] += by;
      return { affected: r ? 1 : 0 };
    },
    async find({ order }: { order?: { count?: "ASC" | "DESC" } } = {}) {
      const sorted = [...rows];
      if (order?.count === "DESC") {
        sorted.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
      }
      return sorted;
    },
  };
}

function makeService(seed: VocabItemEntity[] = []) {
  const repo = makeRepo(seed);
  const svc = new VocabService(repo as unknown as Repository<VocabItemEntity>);
  return { svc, repo };
}

function seedRow(over: Partial<VocabItemEntity> = {}): VocabItemEntity {
  return {
    id: "seed-1",
    text: "Overwhelmed",
    normalized: "overwhelmed",
    count: 1,
    notes: "ghi chú",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  } as VocabItemEntity;
}

describe("VocabService.track", () => {
  it("creates a new word with count 1 and empty notes", async () => {
    const { svc } = makeService();

    const res = await svc.track({ text: "overwhelmed" });

    expect(res.status).toBe("created");
    expect(res.item).toMatchObject({ text: "overwhelmed", count: 1, notes: "" });
    expect(res.item.id).toBeTruthy();
  });

  it("stores trimmed, whitespace-collapsed text with original casing", async () => {
    const { svc } = makeService();

    const res = await svc.track({ text: "  New   Word " });

    expect(res.item.text).toBe("New Word");
  });

  it("increments an existing word case-insensitively, keeping casing and notes", async () => {
    const { svc } = makeService([seedRow()]);

    const res = await svc.track({ text: "  OVERWHELMED  " });

    expect(res.status).toBe("incremented");
    expect(res.item).toMatchObject({
      text: "Overwhelmed",
      count: 2,
      notes: "ghi chú",
    });
  });

  it("does not create a duplicate row on increment", async () => {
    const { svc, repo } = makeService([seedRow()]);

    await svc.track({ text: "overwhelmed" });

    expect(repo.rows).toHaveLength(1);
  });

  it("rejects empty text with reason 'empty'", async () => {
    const { svc } = makeService();
    expect.assertions(2);
    try {
      await svc.track({ text: "   " });
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toEqual({
        status: "error",
        reason: "empty",
      });
    }
  });

  it("treats a missing/invalid text field as 'empty'", async () => {
    const { svc } = makeService();
    expect.assertions(2);
    try {
      await svc.track({ word: 123 });
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toEqual({
        status: "error",
        reason: "empty",
      });
    }
  });

  it("rejects text longer than 50 chars with reason 'too_long'", async () => {
    const { svc } = makeService();
    expect.assertions(1);
    try {
      await svc.track({ text: "a".repeat(51) });
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toEqual({
        status: "error",
        reason: "too_long",
      });
    }
  });

  it("accepts text of exactly 50 chars", async () => {
    const { svc } = makeService();

    const res = await svc.track({ text: "a".repeat(50) });

    expect(res.status).toBe("created");
  });
});

describe("VocabService.list", () => {
  it("returns items ordered by count descending", async () => {
    const { svc } = makeService([
      seedRow({ id: "1", text: "alpha", normalized: "alpha", count: 1 }),
      seedRow({ id: "2", text: "beta", normalized: "beta", count: 3 }),
    ]);

    const list = await svc.list();

    expect(list.map((i) => i.text)).toEqual(["beta", "alpha"]);
  });
});
