CREATE TABLE `userDishLog` (
  `logId` int NOT NULL AUTO_INCREMENT,
  `userId` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dishId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `restaurantId` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rating` decimal(3,1) DEFAULT NULL,
  `dateTried` date NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`logId`),
  KEY `idx_userDishLog_userId` (`userId`),
  KEY `idx_userDishLog_dishId` (`dishId`),
  KEY `idx_userDishLog_date` (`userId`, `dateTried`),
  CONSTRAINT `fk_userDishLog_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `fk_userDishLog_dish` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
