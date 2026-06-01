CREATE TABLE IF NOT EXISTS `search_terms` (
  `searchTermId` int NOT NULL AUTO_INCREMENT,
  `term` varchar(100) NOT NULL,
  `mappings` json NOT NULL COMMENT 'AI-generated mappings: { categories: [{id, weight}], dishTypes: [{id, weight}], tags: [{id, weight}] }',
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`searchTermId`),
  UNIQUE KEY `idx_search_terms_term` (`term`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
