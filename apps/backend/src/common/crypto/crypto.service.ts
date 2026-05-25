import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Env } from "../../config/env.validation";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    const hex = config.get("ENCRYPTION_KEY", { infer: true }) as string;
    this.key = Buffer.from(hex, "hex");
    if (this.key.length !== 32) {
      throw new Error("ENCRYPTION_KEY must decode to 32 bytes");
    }
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, ct, tag]).toString("base64");
  }

  decrypt(packed: string): string {
    const buf = Buffer.from(packed, "base64");
    if (buf.length < IV_LEN + TAG_LEN + 1) {
      throw new Error("Ciphertext too short");
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(buf.length - TAG_LEN);
    const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      "utf8",
    );
  }

  hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }

  mask(value: string | null, visible = 4): string | null {
    if (!value) return null;
    if (value.length <= visible) return "•".repeat(value.length);
    return `${"•".repeat(value.length - visible)}${value.slice(-visible)}`;
  }
}
