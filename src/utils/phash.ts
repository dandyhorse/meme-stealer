import sharp from 'sharp';
import { TelegramClient } from 'telegram';
import { Api } from 'telegram';

import { LogLevel } from './common/dtos';
import { systemLogger } from './system-logger';

export const HAMMING_THRESHOLD = 5;

/**
 * Compute dHash (difference hash) from image buffer.
 * Resize to 9x8, grayscale, compare adjacent pixels -> 64-bit hash.
 */
export const computeDHash = async (imageBuffer: Buffer): Promise<bigint> => {
  const { data } = await sharp(imageBuffer)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = BigInt(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      if (left > right) {
        hash |= BigInt(1) << BigInt(y * 8 + x);
      }
    }
  }

  return hash;
};

/**
 * Hamming distance between two 64-bit hashes.
 */
export const hammingDistance = (a: bigint, b: bigint): number => {
  let xor = a ^ b;
  let count = 0;
  while (xor > BigInt(0)) {
    count += Number(xor & BigInt(1));
    xor >>= BigInt(1);
  }
  return count;
};

/**
 * Extract thumbs array from message media (photo, document, story).
 */
const getThumbsFromMedia = (media: Api.TypeMessageMedia): Api.TypePhotoSize[] | undefined => {
  let thumbs: Api.TypePhotoSize[] | undefined;

  if ('document' in media && media.document && 'thumbs' in media.document) {
    thumbs = media.document.thumbs;
  }

  if ('photo' in media && media.photo && 'sizes' in media.photo) {
    thumbs = media.photo.sizes;
  }

  if ('story' in media && media.story && 'media' in media.story) {
    const storyMedia = media.story.media;
    if (storyMedia && 'photo' in storyMedia && storyMedia.photo && 'sizes' in storyMedia.photo) {
      thumbs = storyMedia.photo.sizes;
    }
    if (
      storyMedia &&
      'document' in storyMedia &&
      storyMedia.document &&
      'thumbs' in storyMedia.document
    ) {
      thumbs = storyMedia.document.thumbs;
    }
  }

  return thumbs;
};

/**
 * Find the best PhotoSize for hashing: prefer 'm' (~320x320), fallback to 's' (~100x100).
 */
const findBestPhotoSize = (thumbs: Api.TypePhotoSize[]): Api.PhotoSize | null => {
  const medium = thumbs.find(
    (t): t is Api.PhotoSize => t instanceof Api.PhotoSize && t.type === 'm',
  );
  if (medium) return medium;

  const small = thumbs.find(
    (t): t is Api.PhotoSize => t instanceof Api.PhotoSize && t.type === 's',
  );
  return small || null;
};

/**
 * Download thumbnail from Telegram and compute dHash.
 * Returns null if no suitable thumbnail or on any error (never blocks forwarding).
 */
export const safeComputeHash = async (
  message: Api.Message,
  client: TelegramClient,
): Promise<bigint | null> => {
  try {
    const media = message.media;
    if (!media) return null;

    const thumbs = getThumbsFromMedia(media);
    if (!thumbs) return null;

    const bestThumb = findBestPhotoSize(thumbs);
    if (!bestThumb) return null;

    const buffer = await client.downloadMedia(message.media!, { thumb: bestThumb });
    if (!buffer || typeof buffer === 'string') return null;

    return await computeDHash(buffer as Buffer);
  } catch (err) {
    systemLogger.log({
      level: LogLevel.WARN,
      module: 'PHASH',
      message: `Hash computation failed for message ${message.id}`,
      details: err,
    });
    return null;
  }
};
