"use client";

/**
 * Browser-side cryptography helpers for end-to-end token protection.
 *
 * Threat model: the server is treated as hostile for the *encrypted blob*. The
 * blob is AES-256-GCM ciphertext under a key derived from the user's password
 * via PBKDF2-SHA256 with 600,000 iterations (per OWASP 2023 guidance). The
 * server never sees the password or the derived key.
 *
 * Uses `crypto.subtle` (Web Crypto API) — available in all modern browsers and
 * Node 20+, so this module is also testable in Vitest with the node test env.
 */

const DEFAULT_ITERATIONS = 600_000;
const IV_LEN = 12; // 96-bit IV is the AES-GCM standard.
const SALT_LEN = 16; // 128-bit salt is plenty for PBKDF2.

export function getDefaultIterations(): number {
  return DEFAULT_ITERATIONS;
}

export async function deriveKey(
  password: string,
  saltB64: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const salt = base64ToBytes(saltB64);
  const pwKey = await crypto.subtle.importKey(
    "raw",
    // Cast to BufferSource — TS sees the Uint8Array's ArrayBufferLike as
    // potentially SharedArrayBuffer; AES-GCM/PBKDF2 only accept ArrayBuffer.
    // The runtime cares about bytes, not the TS view.
    enc.encode(password) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    pwKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptString(plain: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plain) as BufferSource,
  );
  const ctBytes = new Uint8Array(ct);
  const combined = new Uint8Array(iv.length + ctBytes.length);
  combined.set(iv, 0);
  combined.set(ctBytes, iv.length);
  return bytesToBase64(combined);
}

export async function decryptString(b64: string, key: CryptoKey): Promise<string> {
  const combined = base64ToBytes(b64);
  const iv = combined.slice(0, IV_LEN);
  const ct = combined.slice(IV_LEN);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

export function generateSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  return bytesToBase64(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
