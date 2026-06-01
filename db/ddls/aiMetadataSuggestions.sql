CREATE TABLE `aiMetadataSuggestions` (
  `suggestionId` int NOT NULL AUTO_INCREMENT,
  `dishId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadataType` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `justification` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `createdAt` bigint NOT NULL,
  `resolvedAt` bigint DEFAULT NULL,
  `resolvedBy` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`suggestionId`),
  UNIQUE KEY `idx_ai_metadata_suggestions_dish_type_name` (`dishId`,`metadataType`,`name`),
  KEY `idx_ai_metadata_suggestions_status` (`status`),
  KEY `idx_ai_metadata_suggestions_type_name` (`metadataType`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci