CREATE TABLE `files` (
  `fileId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileType` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileName` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `size` bigint NOT NULL,
  `uploadedBy` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `uploaded` bigint NOT NULL,
  PRIMARY KEY (`fileId`),
  KEY `idx_files_uploadedBy` (`uploadedBy`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci