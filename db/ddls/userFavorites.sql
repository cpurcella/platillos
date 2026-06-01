CREATE TABLE `userFavorites` (
  `userId` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dishId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` int NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`userId`, `position`),
  UNIQUE KEY `idx_userFavorites_dish` (`userId`, `dishId`),
  KEY `idx_userFavorites_userId` (`userId`),
  CONSTRAINT `fk_userFavorites_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `fk_userFavorites_dish` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
