/**
 * Minimal Keccak-256 (Ethereum). Used to derive a TEE address from its
 * secp256k1 public key: address = keccak256(x ‖ y)[12:].
 */

const MASK64 = BigInt("0xffffffffffffffff");
const ZERO = BigInt(0);
const ONE = BigInt(1);

const ROTL = (x, n) =>
  ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK64;

const RC = [
  "0x0000000000000001", "0x0000000000008082", "0x800000000000808a",
  "0x8000000080008000", "0x000000000000808b", "0x0000000080000001",
  "0x8000000080008081", "0x8000000000008009", "0x000000000000008a",
  "0x0000000000000088", "0x0000000080008009", "0x000000008000000a",
  "0x000000008000808b", "0x800000000000008b", "0x8000000000008089",
  "0x8000000000008003", "0x8000000000008002", "0x8000000000000080",
  "0x000000000000800a", "0x800000008000000a", "0x8000000080008081",
  "0x8000000000008080", "0x0000000080000001", "0x8000000080008008",
].map((h) => BigInt(h));

const RHO = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
];

const PI = [
  0, 10, 20, 5, 15, 16, 1, 11, 21, 6, 7, 17, 2, 12, 22, 23, 8, 18, 3, 13, 14,
  24, 9, 19, 4,
];

function keccakF(s) {
  for (let round = 0; round < 24; round++) {
    const c = new Array(5);
    for (let x = 0; x < 5; x++) {
      c[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ ROTL(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) s[y + x] ^= d;
    }

    const b = new Array(25);
    for (let i = 0; i < 25; i++) b[PI[i]] = ROTL(s[i], RHO[i]);

    for (let y = 0; y < 25; y += 5) {
      const t0 = b[y];
      const t1 = b[y + 1];
      const t2 = b[y + 2];
      const t3 = b[y + 3];
      const t4 = b[y + 4];
      s[y] = t0 ^ (~t1 & t2);
      s[y + 1] = t1 ^ (~t2 & t3);
      s[y + 2] = t2 ^ (~t3 & t4);
      s[y + 3] = t3 ^ (~t4 & t0);
      s[y + 4] = t4 ^ (~t0 & t1);
    }
    s[0] ^= RC[round];
  }
}

export function keccak256(data) {
  const rate = 136;
  const state = new Array(25).fill(ZERO);
  let offset = 0;

  while (offset < data.length) {
    const take = Math.min(rate, data.length - offset);
    for (let i = 0; i < take; i++) {
      const lane = i >> 3;
      const shift = BigInt((i & 7) * 8);
      state[lane] ^= BigInt(data[offset + i]) << shift;
    }
    offset += take;
    if (take === rate) keccakF(state);
  }

  const rem = data.length % rate;
  state[rem >> 3] ^= ONE << BigInt((rem & 7) * 8);
  state[(rate - 1) >> 3] ^= BigInt(0x80) << BigInt(((rate - 1) & 7) * 8);
  keccakF(state);

  const out = new Uint8Array(32);
  const ff = BigInt(0xff);
  for (let i = 0; i < 32; i++) {
    out[i] = Number((state[i >> 3] >> BigInt((i & 7) * 8)) & ff);
  }
  return out;
}
