CREATE TABLE `reviews` (
  `reviewId` int NOT NULL AUTO_INCREMENT,
  `rating` int NOT NULL,
  `review` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `modifications` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dishId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `submittedBy` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `submitted` bigint NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `statusUpdated` bigint DEFAULT NULL,
  `statusUpdatedBy` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`reviewId`),
  KEY `dishId` (`dishId`),
  KEY `idx_reviews_dishId` (`dishId`),
  KEY `idx_reviews_submittedBy` (`submittedBy`),
  KEY `idx_reviews_dishId_submittedBy` (`dishId`,`submittedBy`),
  KEY `idx_reviews_submitted` (`submitted`),
  CONSTRAINT `fk_reviews_dish` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci