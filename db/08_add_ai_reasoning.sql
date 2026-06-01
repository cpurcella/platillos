ALTER TABLE dishes ADD COLUMN aiReasoning TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE restaurants ADD COLUMN aiReasoning TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE reviews ADD COLUMN aiReasoning TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL;
ALTER TABLE reviews_photos ADD COLUMN aiReasoning TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL;
