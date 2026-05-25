import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./encryption";

const key = Buffer.alloc(32, 7).toString("base64");

describe("encryption", () => {
  it("round-trips a string", () => {
    const ct = encrypt("hello world", key);
    expect(ct).not.toContain("hello");
    expect(decrypt(ct, key)).toBe("hello world");
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    expect(encrypt("x", key)).not.toBe(encrypt("x", key));
  });

  it("throws on tamper", () => {
    const ct = encrypt("x", key);
    const tampered = ct.slice(0, -2) + "AA";
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("rejects keys that aren't 32 bytes", () => {
    expect(() => encrypt("x", Buffer.alloc(16).toString("base64"))).toThrow();
  });
});
