CREATE TABLE `sessions` (
  `sessionId` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created` bigint NOT NULL,
  `expiration` bigint NOT NULL,
  PRIMARY KEY (`sessionId`),
  KEY `userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci