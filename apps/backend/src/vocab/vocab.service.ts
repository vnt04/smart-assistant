import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
   * Records sightings of a word: creates it or increments the existing row's
   * count. `count` (default 1) lets the manual "add word" form record several
   * sightings at once. Dedup is case-insensitive on the trim +
   * whitespace-collapsed text.
   */
  async track(input: unknown): Promise<TrackVocabResponse> {
    const { text, count } = extractInput(input);
    const cleaned = normalizeText(text);

    if (cleaned.length === 0) {
      throw new BadRequestException({ status: "error", reason: "empty" });
    }
    if (cleaned.length > MAX_VOCAB_TEXT_LENGTH) {
      throw new BadRequestException({ status: "error", reason: "too_long" });
    }

    const normalized = cleaned.toLowerCase();

    const existing = await this.repo.findOne({ where: { normalized } });
    if (existing) {
      return {
        status: "incremented",
        item: await this.bumpCount(existing.id, count),
      };
    }

    try {
      const saved = await this.repo.save(
        this.repo.create({ text: cleaned, normalized, count, notes: "" }),
      );
      return { status: "created", item: toDto(saved) };
    } catch (e) {
      // A concurrent request created the same word first — increment instead
      // of failing on the unique constraint.
      if (isDuplicateEntry(e)) {
        const row = await this.repo.findOneOrFail({ where: { normalized } });
        return {
          status: "incremented",
          item: await this.bumpCount(row.id, count),
        };
      }
      throw e;
    }
  }

  /** Lists stored words, most-forgotten (highest count) first. */
  async list(): Promise<VocabItem[]> {
    const rows = await this.repo.find({ order: { count: "DESC", text: "ASC" } });
    return rows.map(toDto);
  }

  /** Permanently removes a word; throws `not_found` if the id does not exist. */
  async remove(id: string): Promise<void> {
    const result = await this.repo.delete({ id });
    if (!result.affected) {
      throw new NotFoundException({ status: "error", reason: "not_found" });
    }
  }

  private async bumpCount(id: string, by: number): Promise<VocabItem> {
    await this.repo.increment({ id }, "count", by);
    const row = await this.repo.findOneOrFail({ where: { id } });
    return toDto(row);
  }
}

/**
 * Pulls `text` and the (optional) `count` out of an untrusted body. A missing
 * or non-string `text`, or an out-of-range `count`, is rejected up front so the
 * extension and the manual form get a stable reason code.
 */
function extractInput(input: unknown): { text: string; count: number } {
  const parsed = createVocabInputSchema.safeParse(input);
  if (!parsed.success) {
    const badCount = parsed.error.issues.some((i) => i.path[0] === "count");
    throw new BadRequestException({
      status: "error",
      reason: badCount ? "invalid_count" : "empty",
    });
  }
  return { text: parsed.data.text, count: parsed.data.count ?? 1 };
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
