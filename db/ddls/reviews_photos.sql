CREATE TABLE `reviews_photos` (
  `reviewPhotoId` int NOT NULL AUTO_INCREMENT,
  `reviewId` int NOT NULL,
  `fileId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `statusUpdated` bigint DEFAULT NULL,
  `statusUpdatedBy` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`reviewPhotoId`),
  KEY `reviewId` (`reviewId`),
  KEY `idx_reviews_photos_reviewId` (`reviewId`),
  KEY `idx_reviews_photos_fileId` (`fileId`),
  CONSTRAINT `fk_reviews_photos_file` FOREIGN KEY (`fileId`) REFERENCES `files` (`fileId`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_photos_review` FOREIGN KEY (`reviewId`) REFERENCES `reviews` (`reviewId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci