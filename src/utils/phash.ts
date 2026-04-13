import sharp from 'sharp';

const HASH_SIZE = 8;
const RESIZE_WIDTH = HASH_SIZE + 1;
const RESIZE_HEIGHT = HASH_SIZE;
const SIGN_BIT = BigInt(1) << BigInt(63);
const FULL_64 = BigInt(1) << BigInt(64);
const MASK_64 = FULL_64 - BigInt(1);
const MASK_32 = BigInt(0xffffffff);
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Compute dHash (difference hash) from image buffer.
 * Resize to 9×8 grayscale, compare adjacent horizontal pixels.
 * Returns signed 64-bit BigInt suitable for PostgreSQL bigint storage.
 */
export async function computeDHash(imageBuffer: Buffer): Promise<bigint> {
  if (imageBuffer.byteLength > MAX_INPUT_BYTES) {
    throw new Error('Image too large for pHash');
  }

  const { data } = await sharp(imageBuffer)
    .resize(RESIZE_WIDTH, RESIZE_HEIGHT, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = BigInt(0);
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      const leftPixel = data[y * RESIZE_WIDTH + x];
      const rightPixel = data[y * RESIZE_WIDTH + x + 1];
      if (leftPixel > rightPixel) {
        hash |= BigInt(1) << BigInt(y * HASH_SIZE + x);
      }
    }
  }

  // Convert unsigned [0, 2^64-1] to signed [-2^63, 2^63-1] for PostgreSQL bigint
  return hash >= SIGN_BIT ? hash - FULL_64 : hash;
}

function popcount32(n: number): number {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

/**
 * Hamming distance between two signed 64-bit hashes.
 * Masks XOR to 64-bit unsigned before counting to handle signed BigInt storage.
 */
export function hammingDistance(a: bigint, b: bigint): number {
  const xor = (a ^ b) & MASK_64;
  const lo = Number(xor & MASK_32);
  const hi = Number((xor >> BigInt(32)) & MASK_32);
  return popcount32(lo) + popcount32(hi);
}
