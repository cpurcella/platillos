-- Quick-log diary entries (tried a dish without writing a full review)
CREATE TABLE `user_dish_log` (
  `logId` int NOT NULL AUTO_INCREMENT,
  `userId` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dishId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `restaurantId` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rating` tinyint DEFAULT NULL,
  `dateTried` date NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`logId`),
  KEY `idx_user_dish_log_userId` (`userId`),
  KEY `idx_user_dish_log_dishId` (`dishId`),
  KEY `idx_user_dish_log_date` (`userId`, `dateTried`),
  CONSTRAINT `fk_user_dish_log_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_dish_log_dish` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
