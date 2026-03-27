-- Add profile columns to users table
ALTER TABLE `users`
  ADD COLUMN `username` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `isAdmin`,
  ADD COLUMN `avatarFileId` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `lastName`,
  ADD COLUMN `bio` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `avatarFileId`;

ALTER TABLE `users`
  ADD UNIQUE KEY `idx_users_username` (`username`);

-- Favorites table: up to 4 favorite dishes per user
CREATE TABLE `user_favorites` (
  `userId` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dishId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` tinyint NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`userId`, `position`),
  UNIQUE KEY `idx_user_favorites_dish` (`userId`, `dishId`),
  KEY `idx_user_favorites_userId` (`userId`),
  CONSTRAINT `fk_user_favorites_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_favorites_dish` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
