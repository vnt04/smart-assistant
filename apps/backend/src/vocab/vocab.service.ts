import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import {
  createVocabInputSchema,
  MAX_VOCAB_TEXT_LENGTH,
  type TrackVocabResponse,
  type VocabItem,
} from "@assistant/shared";
import { VocabItemEntity } from "./entities/vocab-item.entity";

/** MySQL driver error code for a unique-constraint violation. */
const MYSQL_DUPLICATE_ENTRY = "ER_DUP_ENTRY";

@Injectable()
export class VocabService {
  constructor(
    @InjectRepository(VocabItemEntity)
    private readonly repo: Repository<VocabItemEntity>,
  ) {}

  /**
   * Records one sighting of a word: creates it (count = 1) or increments the
   * existing row's count. Dedup is case-insensitive on the
   * trim + whitespace-collapsed text.
   */
  async track(input: unknown): Promise<TrackVocabResponse> {
    const cleaned = normalizeText(extractText(input));

    if (cleaned.length === 0) {
      throw new BadRequestException({ status: "error", reason: "empty" });
    }
    if (cleaned.length > MAX_VOCAB_TEXT_LENGTH) {
      throw new BadRequestException({ status: "error", reason: "too_long" });
    }

    const normalized = cleaned.toLowerCase();

    const existing = await this.repo.findOne({ where: { normalized } });
    if (existing) {
      return { status: "incremented", item: await this.bumpCount(existing.id) };
    }

    try {
      const saved = await this.repo.save(
        this.repo.create({ text: cleaned, normalized, count: 1, notes: "" }),
      );
      return { status: "created", item: toDto(saved) };
    } catch (e) {
      // A concurrent request created the same word first — increment instead
      // of failing on the unique constraint.
      if (isDuplicateEntry(e)) {
        const row = await this.repo.findOneOrFail({ where: { normalized } });
        return { status: "incremented", item: await this.bumpCount(row.id) };
      }
      throw e;
    }
  }

  /** Lists stored words, most-forgotten (highest count) first. */
  async list(): Promise<VocabItem[]> {
    const rows = await this.repo.find({ order: { count: "DESC", text: "ASC" } });
    return rows.map(toDto);
  }

  private async bumpCount(id: string): Promise<VocabItem> {
    await this.repo.increment({ id }, "count", 1);
    const row = await this.repo.findOneOrFail({ where: { id } });
    return toDto(row);
  }
}

/** Pulls `text` out of an untrusted body; missing/non-string is treated as empty. */
function extractText(input: unknown): string {
  const parsed = createVocabInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({ status: "error", reason: "empty" });
  }
  return parsed.data.text;
}

/** Trims and collapses internal whitespace runs to single spaces. */
function normalizeText(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function isDuplicateEntry(e: unknown): boolean {
  return (
    e instanceof QueryFailedError &&
    (e as QueryFailedError & { code?: string }).code === MYSQL_DUPLICATE_ENTRY
  );
}

function toDto(e: VocabItemEntity): VocabItem {
  return { id: e.id, text: e.text, count: e.count, notes: e.notes };
}
