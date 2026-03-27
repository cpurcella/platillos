CREATE TABLE IF NOT EXISTS `ai_jobs` (
  `jobId` int NOT NULL AUTO_INCREMENT,
  `jobType` varchar(40) NOT NULL COMMENT 'e.g. evaluate_restaurant, evaluate_dish, evaluate_review, evaluate_photo',
  `targetId` varchar(36) NOT NULL COMMENT 'restaurantId, dishId, reviewId, or reviewPhotoId',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT 'pending, processing, completed, failed',
  `attempts` int NOT NULL DEFAULT 0,
  `maxAttempts` int NOT NULL DEFAULT 3,
  `result` json DEFAULT NULL COMMENT 'AI decision output',
  `error` text DEFAULT NULL COMMENT 'Last error message if failed',
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`jobId`),
  KEY `idx_ai_jobs_status` (`status`),
  KEY `idx_ai_jobs_type_target` (`jobType`, `targetId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
