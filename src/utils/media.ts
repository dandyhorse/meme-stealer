import { Api } from 'telegram';

import { tgClient } from '@config/clients';

const DOWNLOAD_TIMEOUT_MS = 5_000;

export const MAX_STICKER_SIZE = 512 * 1024;
export const MAX_GIF_SIZE = 5 * 1024 * 1024;

export type MediaKind = 'photo' | 'video' | 'gif' | 'sticker' | 'round_video' | 'unknown';

export const getMediaType = (media: Api.TypeMessageMedia): string => {
  return media.className || 'Unknown';
};

export function detectMediaKind(message: Api.Message): MediaKind {
  const media = message.media;
  if (!media) return 'unknown';

  if (media instanceof Api.MessageMediaPhoto) return 'photo';

  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const { attributes } = media.document;

    if (attributes.some((a) => a instanceof Api.DocumentAttributeSticker)) return 'sticker';
    if (attributes.some((a) => a instanceof Api.DocumentAttributeAnimated)) return 'gif';

    const videoAttr = attributes.find((a) => a instanceof Api.DocumentAttributeVideo);
    if (videoAttr instanceof Api.DocumentAttributeVideo) {
      return videoAttr.roundMessage ? 'round_video' : 'video';
    }

    if (media.document.mimeType === 'image/gif') return 'gif';
    if (media.document.mimeType === 'image/webp') return 'sticker';
  }

  return 'unknown';
}

function getPhotoSizes(media: Api.TypeMessageMedia): Api.TypePhotoSize[] | undefined {
  let sizes: Api.TypePhotoSize[] | undefined;

  if ('document' in media && media.document && 'thumbs' in media.document) {
    sizes = media.document.thumbs;
  }

  if ('photo' in media && media.photo && 'sizes' in media.photo) {
    sizes = media.photo.sizes;
  }

  if ('story' in media && media.story && 'media' in media.story) {
    const storyMedia = media.story.media;
    if (storyMedia && 'photo' in storyMedia && storyMedia.photo && 'sizes' in storyMedia.photo) {
      sizes = storyMedia.photo.sizes;
    }
    if (
      storyMedia &&
      'document' in storyMedia &&
      storyMedia.document &&
      'thumbs' in storyMedia.document
    ) {
      sizes = storyMedia.document.thumbs;
    }
  }

  return sizes;
}

export const extractThumbnailBytes = (message: Api.Message): Buffer | null => {
  const media = message.media;
  if (!media) return null;

  const thumbs = getPhotoSizes(media);
  if (!thumbs) return null;

  const stripped = thumbs.find(
    (t): t is Api.PhotoStrippedSize => 'type' in t && t.type === 'i' && 'bytes' in t,
  );

  if (stripped && stripped.bytes) {
    return Buffer.from(stripped.bytes);
  }

  return null;
};

/**
 * Download PhotoSize type 'm' (~320×320) for better pHash quality.
 * Falls back to type 's' if 'm' not available.
 * Returns null if no downloadable thumbnail found or on timeout.
 */
export async function downloadThumbnail(message: Api.Message): Promise<Buffer | null> {
  const media = message.media;
  if (!media) return null;

  const sizes = getPhotoSizes(media);
  if (!sizes) return null;

  const preferred = sizes.find(
    (s): s is Api.PhotoSize => s instanceof Api.PhotoSize && s.type === 'm',
  );
  const fallback = sizes.find(
    (s): s is Api.PhotoSize => s instanceof Api.PhotoSize && s.type === 's',
  );

  const targetSize = preferred || fallback;
  if (!targetSize) return null;

  try {
    const downloaded = await Promise.race([
      tgClient.downloadMedia(message, { thumb: targetSize }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DOWNLOAD_TIMEOUT_MS)),
    ]);
    return Buffer.isBuffer(downloaded) ? downloaded : null;
  } catch {
    return null;
  }
}

export async function downloadSmallDocument(
  message: Api.Message,
  maxSizeBytes: number,
): Promise<Buffer | null> {
  const media = message.media;
  if (!media) return null;

  if (!('document' in media) || !media.document || !('size' in media.document)) return null;

  if (Number(media.document.size) > maxSizeBytes) return null;

  try {
    const downloaded = await Promise.race([
      tgClient.downloadMedia(message).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DOWNLOAD_TIMEOUT_MS)),
    ]);
    if (!Buffer.isBuffer(downloaded)) return null;
    if (downloaded.byteLength > maxSizeBytes) return null;
    return downloaded;
  } catch {
    return null;
  }
}
