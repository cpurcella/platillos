CREATE TABLE `userAuth` (
  `userId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `emailToken` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phoneCode` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`userId`),
  KEY `idx_userAuth_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci