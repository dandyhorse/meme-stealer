# Perception Hash - Plan

## Проблема

Текущая система дедупликации на MD5 stripped thumbnails (32x32 JPEG) работает нестабильно:
- Telegram stripped thumbnail - нестандартный формат (заголовок JPEG вырезан), 32x32 пикселей
- MD5 - exact match, любое отличие в байтах = другой хэш
- Одно и то же изображение из разных источников может иметь разную компрессию -> разный MD5
- Ресайз, кроп, ватермарк, пережатие - всё ломает MD5

## Подход: Perceptual Hash с нуля

Полностью заменяем MD5 на perception hash. Не гибрид, а замена.

### Алгоритм (dHash или pHash)

**dHash (difference hash)** - рекомендуется для нашего кейса:
- Быстрее pHash (нет DCT)
- Устойчив к ресайзу и пережатию
- Работает на основе разницы яркости соседних пикселей
- 64-bit хэш (8x9 -> 8x8 сравнений)

**pHash (perceptual hash)** - альтернатива:
- DCT-based, более робастный к серьёзным изменениям
- Медленнее, но точнее при сильных искажениях

### Источник изображений

**Варианты входных данных:**

| Источник | Размер | Нужен download | Качество хэша |
|----------|--------|----------------|----------------|
| PhotoStrippedSize (type 'i') | ~32x32 | Нет (inline) | Низкое - слишком мало данных |
| PhotoSize type 's' | ~100x100 | Да | Среднее |
| PhotoSize type 'm' | ~320x320 | Да | Хорошее |
| Full image | Original | Да (тяжело) | Лучшее |

**Рекомендация**: PhotoSize type 'm' (~320x320). Достаточно для надёжного хэша, не слишком тяжело для скачивания. Stripped thumbnail (32x32) слишком маленький для надёжного pHash/dHash.

### NPM пакеты

- **sharp** - для обработки изображений (resize, grayscale)
- **sharp-phash** - pHash на базе sharp (64-bit hex string)
- Или ручная реализация dHash на sharp (простая: resize -> grayscale -> compare pixels)

### Схема БД

```prisma
model ContentHash {
  id        Int      @id @default(autoincrement())
  phash     BigInt   // 64-bit perceptual hash
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  sources ContentHashSource[]

  @@index([phash])
  @@map("content_hashes")
}

model ContentHashSource {
  id            Int         @id @default(autoincrement())
  contentHash   ContentHash @relation(fields: [contentHashId], references: [id], onDelete: Cascade)
  contentHashId Int
  chat          Chat        @relation(fields: [chatId], references: [id], onDelete: Cascade)
  chatId        Int
  addedAt       DateTime    @default(now())

  @@unique([contentHashId, chatId])
  @@index([chatId])
  @@map("content_hash_sources")
}
```

Или проще - добавить phash в существующую Minithumbnail и заменить md5 на phash.

### Hamming Distance

Сравнение через XOR + popcount:

```sql
-- PostgreSQL 17+ has bit_count()
SELECT bit_count((a # b)::bit(64))::integer AS hamming_distance;
```

```typescript
// В коде (быстрее чем SQL для in-memory кэша)
function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}
```

**Пороги:**
- 0-5: почти идентичные (дубликат)
- 5-10: вероятно тот же контент (нужно тюнить)
- 10+: разные изображения

### Pipeline обработки

```
Message с медиа
  |
  v
Скачать PhotoSize 'm' (320x320) через tgClient.downloadMedia()
  |
  v
sharp: resize(8,9) -> grayscale -> raw pixels
  |
  v
dHash: сравнить яркость соседних пикселей -> 64-bit hash
  |
  v
Поиск в БД: SELECT * FROM content_hashes WHERE hamming_distance(phash, $1) < 5
  |
  +-- Найден: дубликат -> forward to FILTERED
  +-- Не найден: новый -> сохранить хэш, forward to PROXY
```

### Оптимизация поиска (при масштабе)

При <100k записей - прямой scan с Hamming distance ок.

При росте:
1. **In-memory кэш** последних N хэшей (как adminCache pattern)
2. **LSH (Locality-Sensitive Hashing)** - разбиваем 64-bit на 4 блока по 16 bit, индексируем каждый блок отдельно
3. **PostgreSQL расширение pg_similarity** или **pgvector** для нативного поиска

### Риски и вопросы

1. **Скорость скачивания thumbnail 'm'** - нужно замерить. Если медленно, можно качать асинхронно и дедуплицировать post-factum
2. **Порог Hamming distance** - нужно тюнить на реальных данных. Слишком низкий = пропустим дубликаты, слишком высокий = ложные срабатывания
3. **Мемы с текстом** - один и тот же шаблон с разным текстом будет иметь разный хэш. Это ок (разный контент)
4. **Видео** - для видео хэшить первый кадр? Или thumbnail? Нужно решить

### Шаги реализации (будущий патч)

1. `npm install sharp sharp-phash` (или своя dHash реализация)
2. Миграция: добавить phash column или новая модель
3. Утилита `src/utils/phash.ts`: download thumbnail -> compute hash
4. Обновить `processMessage` в index.ts: вместо MD5 -> pHash + Hamming distance
5. Backfill скрипт для пересчёта хэшей существующих записей
6. Тюнинг порога на реальных данных
