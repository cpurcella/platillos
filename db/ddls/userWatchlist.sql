CREATE TABLE `userWatchlist` (
  `userId` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dishId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`userId`, `dishId`),
  KEY `idx_userWatchlist_userId` (`userId`),
  KEY `idx_userWatchlist_dishId` (`dishId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
