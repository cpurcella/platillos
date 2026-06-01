CREATE TABLE `reviewLikes` (
  `userId` varchar(36) NOT NULL,
  `reviewId` int NOT NULL,
  `value` tinyint NOT NULL DEFAULT 1,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`userId`, `reviewId`),
  KEY `idx_reviewLikes_reviewId` (`reviewId`),
  CONSTRAINT `fk_reviewLikes_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviewLikes_review` FOREIGN KEY (`reviewId`) REFERENCES `reviews` (`reviewId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
