CREATE TABLE `dishes` (
  `dishId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `restaurantId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `submitted` bigint NOT NULL,
  `submittedBy` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `score` decimal(3,1) DEFAULT NULL,
  `coverPhoto` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewCount` int NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `statusUpdated` bigint DEFAULT NULL,
  `statusUpdatedBy` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`dishId`),
  KEY `idx_dishes_restaurantId` (`restaurantId`),
  KEY `idx_dishes_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci