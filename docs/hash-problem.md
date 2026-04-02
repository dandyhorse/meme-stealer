# Hash Problem Analysis: MD5 Deduplication Limitations

## Current Approach

The meme-stealer currently uses **MD5 hashing** of Telegram's stripped thumbnails (`PhotoStrippedSize`, type `i`) for content deduplication.

### How It Works
1. Extract the ~32x32 JPEG thumbnail embedded in the Telegram API response
2. Compute MD5 hash of the raw bytes
3. Check database for exact match
4. If match exists → duplicate; if not → new content

### Why It Works (Sometimes)
- **Speed**: MD5 is extremely fast, O(1) database lookup
- **No downloads**: Thumbnails are inline in the API response
- **Deterministic**: Telegram generates identical thumbnails for the exact same uploaded file
- **Catches**: Direct forwards, reposts, and re-sends of the same Telegram message

---

## The Problem

MD5 is a **cryptographic hash** designed for exact byte matching. It fails completely for visual similarity detection.

### What Breaks MD5 Deduplication

| Scenario | Why MD5 Fails |
|----------|---------------|
| **Independent uploads** | Two users upload the same image file from disk. Telegram re-encodes each upload separately, producing different JPEG compression artifacts → different bytes → different MD5 |
| **Different save quality** | One user saves at 80% JPEG quality, another at 95%. Different file sizes, different bytes |
| **Screenshots** | Taking a screenshot adds UI elements, changes resolution, and introduces new compression |
| **Cropping** | Even a 1-pixel crop changes the entire byte stream |
| **Text overlays** | Adding captions or watermarks changes pixel data completely |
| **Format conversion** | PNG → JPEG → WebP conversions produce entirely different byte sequences |
| **Telegram re-encoding** | Each time an image passes through Telegram's servers, it may be re-compressed differently |

### Real-World Impact

If a popular meme is independently uploaded by 5 different channels:
- **MD5 system**: Sees 5 unique images, forwards all 5 to the proxy channel
- **Perceptual system**: Recognizes they're visually identical, forwards only the first one

---

## Technical Deep Dive

### Stripped Thumbnail Format
Telegram's `PhotoStrippedSize` (type `i`) is a non-standard JPEG variant:
- ~32x32 pixels
- JPEG header is stripped/modified
- Designed for fast preview rendering, not reliable hashing
- Too small for robust perceptual hashing (not enough pixel data)

### Why 32x32 is Too Small
Perceptual hashing algorithms (pHash, dHash, aHash) rely on comparing pixel relationships:
- At 32x32, there's only 1,024 pixels total
- After grayscale conversion and resizing for hash computation, there's barely enough data
- Small images amplify the impact of compression artifacts
- **Recommendation**: Use `PhotoSize` type `m` (~320x320) for perceptual hashing

---

## The Solution: Perceptual Hashing

Replace MD5 with **perceptual hashing** (pHash or dHash) to detect visually similar images regardless of byte-level differences.

### Key Differences

| Property | MD5 | Perceptual Hash |
|----------|-----|-----------------|
| **Input** | Raw bytes | Pixel data (grayscale) |
| **Comparison** | Exact match (`==`) | Hamming distance (threshold) |
| **Resilience** | None (1 bit change = different hash) | High (tolerates compression, resize, crop) |
| **Speed** | Extremely fast | Fast (with `sharp` library) |
| **Storage** | 32-char hex string | 16-char hex string (64-bit) |

### Hamming Distance Thresholds

When comparing two perceptual hashes:
- **0-5**: Nearly identical (definite duplicate)
- **5-10**: Likely the same content (tunable threshold)
- **10+**: Different images

### Implementation Plan

See `docs/perception-hash-plan.md` for the complete implementation roadmap, including:
- Switching from `PhotoStrippedSize` to `PhotoSize` type `m` (~320x320)
- Installing `sharp` and `sharp-phash` packages
- Database schema migration (BigInt column for 64-bit hash)
- Hamming distance calculation in TypeScript and PostgreSQL
- Backfilling existing records

---

## Summary

| Aspect | Current (MD5) | Future (pHash) |
|--------|---------------|----------------|
| Detects exact forwards | ✅ Yes | ✅ Yes |
| Detects independent uploads | ❌ No | ✅ Yes |
| Detects resized images | ❌ No | ✅ Yes |
| Detects re-compressed images | ❌ No | ✅ Yes |
| Detects slight crops | ❌ No | ✅ Partially |
| Performance | Very fast | Fast (with caching) |
| Complexity | Low | Medium |

**Bottom line**: MD5 deduplication is a good starting point but fundamentally limited. Perceptual hashing is the correct solution for a meme aggregation bot that needs to catch visually identical content across multiple independent sources.