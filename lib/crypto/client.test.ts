// @vitest-environment node
// Web Crypto is exposed on Node 20+ globally; the node environment is the
// reliable place to test it (jsdom may or may not surface crypto.subtle).
import { describe, it, expect } from "vitest";
import {
  deriveKey,
  encryptString,
  decryptString,
  generateSalt,
  getDefaultIterations,
} from "./client";

// Use a tiny iteration count so the test isn't 30s of PBKDF2 hashing.
const TEST_ITERATIONS = 1_000;

describe("client crypto", () => {
  it("round-trips a string with deriveKey + encryptString + decryptString", async () => {
    const salt = generateSalt();
    const key = await deriveKey("correct horse battery staple", salt, TEST_ITERATIONS);
    const plain = "perm-xyz-secret-token";
    const blob = await encryptString(plain, key);
    expect(blob).not.toBe(plain);
    expect(blob).not.toContain(plain);
    const recovered = await decryptString(blob, key);
    expect(recovered).toBe(plain);
  });

  it("decryption fails with the wrong password", async () => {
    const salt = generateSalt();
    const key = await deriveKey("right-password", salt, TEST_ITERATIONS);
    const blob = await encryptString("hello", key);

    const wrongKey = await deriveKey("wrong-password", salt, TEST_ITERATIONS);
    await expect(decryptString(blob, wrongKey)).rejects.toThrow();
  });

  it("decryption fails with the wrong salt", async () => {
    const password = "password";
    const saltA = generateSalt();
    const saltB = generateSalt();
    const keyA = await deriveKey(password, saltA, TEST_ITERATIONS);
    const blob = await encryptString("hello", keyA);

    const keyB = await deriveKey(password, saltB, TEST_ITERATIONS);
    await expect(decryptString(blob, keyB)).rejects.toThrow();
  });

  it("generateSalt yields distinct values each call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(generateSalt());
    expect(seen.size).toBe(20);
  });

  it("getDefaultIterations is OWASP-2023 600k", () => {
    expect(getDefaultIterations()).toBe(600_000);
  });

  it("two encryptions of the same plaintext under the same key differ (random IV)", async () => {
    const salt = generateSalt();
    const key = await deriveKey("pw", salt, TEST_ITERATIONS);
    const a = await encryptString("same", key);
    const b = await encryptString("same", key);
    expect(a).not.toBe(b);
    // Both decrypt back to the original.
    expect(await decryptString(a, key)).toBe("same");
    expect(await decryptString(b, key)).toBe("same");
  });
});
