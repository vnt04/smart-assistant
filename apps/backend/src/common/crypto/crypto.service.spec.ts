import { ConfigService } from "@nestjs/config";
import { CryptoService } from "./crypto.service";

function makeService(): CryptoService {
  const key = "0".repeat(64);
  const config = {
    get: () => key,
  } as unknown as ConfigService<any, true>;
  return new CryptoService(config);
}

describe("CryptoService", () => {
  const svc = makeService();

  it("encrypt → decrypt roundtrip", () => {
    const plain = "sk-ant-api03-very-secret-token";
    const enc = svc.encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(svc.decrypt(enc)).toBe(plain);
  });

  it("encrypt produces distinct ciphertexts (random IV)", () => {
    const a = svc.encrypt("same");
    const b = svc.encrypt("same");
    expect(a).not.toBe(b);
  });

  it("decrypt throws on tampered ciphertext", () => {
    const enc = svc.encrypt("hello");
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 0xff;
    expect(() => svc.decrypt(buf.toString("base64"))).toThrow();
  });

  it("hashToken is deterministic and 64 hex chars", () => {
    const h = svc.hashToken("abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(svc.hashToken("abc")).toBe(h);
  });

  it("mask keeps trailing chars", () => {
    expect(svc.mask("abcdefgh")).toBe("••••efgh");
    expect(svc.mask(null)).toBeNull();
    expect(svc.mask("xy")).toBe("••");
  });

  it("throws when key is wrong size", () => {
    const bad = { get: () => "deadbeef" } as unknown as ConfigService<any, true>;
    expect(() => new CryptoService(bad)).toThrow();
  });
});
