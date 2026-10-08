-- Current schema for a new MySQL 8 database. Historical migrations are in db/.

CREATE TABLE `users` (
  `userId` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `isAdmin` tinyint NOT NULL DEFAULT '0',
  `username` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firstName` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lastName` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `avatarFileId` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bio` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dob` date NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `addressStreet` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `addressCity` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `addressZip` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `addressState` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `addressCounty` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `addressLat` decimal(10,7) DEFAULT NULL,
  `addressLng` decimal(10,7) DEFAULT NULL,
  `optInUpdates` tinyint(1) DEFAULT '0',
  `agreedToTerms` tinyint(1) DEFAULT '0',
  `consentSms` tinyint(1) DEFAULT '0',
  `emailVerified` bigint DEFAULT NULL,
  `phoneVerified` bigint DEFAULT NULL,
  `created` bigint NOT NULL,
  `lastLogin` bigint DEFAULT NULL,
  PRIMARY KEY (`userId`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `idx_users_username` (`username`),
  KEY `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `userAuth` (
  `userId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `emailToken` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phoneCode` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`userId`),
  KEY `idx_userAuth_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sessions` (
  `sessionId` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created` bigint NOT NULL,
  `expiration` bigint NOT NULL,
  PRIMARY KEY (`sessionId`),
  KEY `userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cities` (
  `cityId` int NOT NULL AUTO_INCREMENT,
  `state` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lat` decimal(12,9) NOT NULL,
  `lng` decimal(12,9) NOT NULL,
  PRIMARY KEY (`cityId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `categories` (
  `categoryId` int NOT NULL AUTO_INCREMENT,
  `category` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`categoryId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dishTypes` (
  `dishTypeId` int NOT NULL AUTO_INCREMENT,
  `dishType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`dishTypeId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tags` (
  `tagId` int NOT NULL AUTO_INCREMENT,
  `tag` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`tagId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `restaurants` (
  `restaurantId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cityId` int NOT NULL,
  `address` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zip` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lat` decimal(12,9) NOT NULL,
  `lng` decimal(12,9) NOT NULL,
  `submitted` bigint NOT NULL,
  `submittedBy` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `coords` point GENERATED ALWAYS AS (st_srid(point(`lng`,`lat`),4326)) STORED,
  `coverImage` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `statusUpdated` bigint DEFAULT NULL,
  `statusUpdatedBy` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aiReasoning` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`restaurantId`),
  UNIQUE KEY `idx_restaurants_name_address` (`name`,`address`),
  KEY `idx_restaurants_cityId` (`cityId`),
  KEY `idx_restaurants_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dishes` (
  `dishId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `restaurantId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemType` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'food',
  `submitted` bigint NOT NULL,
  `submittedBy` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `score` decimal(3,1) DEFAULT NULL,
  `coverPhoto` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewCount` int NOT NULL DEFAULT '0',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `statusUpdated` bigint DEFAULT NULL,
  `statusUpdatedBy` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aiReasoning` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`dishId`),
  KEY `idx_dishes_restaurantId` (`restaurantId`),
  KEY `idx_dishes_itemType_status` (`itemType`,`status`),
  KEY `idx_dishes_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `files` (
  `fileId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileType` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileName` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `size` bigint NOT NULL,
  `uploadedBy` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `uploaded` bigint NOT NULL,
  PRIMARY KEY (`fileId`),
  KEY `idx_files_uploadedBy` (`uploadedBy`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reviews` (
  `reviewId` int NOT NULL AUTO_INCREMENT,
  `rating` decimal(3,1) NOT NULL,
  `review` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `modifications` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dishId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `submittedBy` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `submitted` bigint NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `statusUpdated` bigint DEFAULT NULL,
  `statusUpdatedBy` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aiReasoning` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`reviewId`),
  KEY `dishId` (`dishId`),
  KEY `idx_reviews_dishId` (`dishId`),
  KEY `idx_reviews_submittedBy` (`submittedBy`),
  KEY `idx_reviews_dishId_submittedBy` (`dishId`,`submittedBy`),
  KEY `idx_reviews_submitted` (`submitted`),
  CONSTRAINT `fk_reviews_dish` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reviews_photos` (
  `reviewPhotoId` int NOT NULL AUTO_INCREMENT,
  `reviewId` int NOT NULL,
  `fileId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `statusUpdated` bigint DEFAULT NULL,
  `statusUpdatedBy` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aiReasoning` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`reviewPhotoId`),
  KEY `reviewId` (`reviewId`),
  KEY `idx_reviews_photos_reviewId` (`reviewId`),
  KEY `idx_reviews_photos_fileId` (`fileId`),
  CONSTRAINT `fk_reviews_photos_file` FOREIGN KEY (`fileId`) REFERENCES `files` (`fileId`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_photos_review` FOREIGN KEY (`reviewId`) REFERENCES `reviews` (`reviewId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dishes_categories` (
  `dishId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoryId` int NOT NULL,
  PRIMARY KEY (`dishId`,`categoryId`),
  KEY `categoryId` (`categoryId`),
  CONSTRAINT `dishes_categories_ibfk_1` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE,
  CONSTRAINT `dishes_categories_ibfk_2` FOREIGN KEY (`categoryId`) REFERENCES `categories` (`categoryId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dishes_dishTypes` (
  `dishId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `dishTypeId` int NOT NULL,
  PRIMARY KEY (`dishId`,`dishTypeId`),
  KEY `dishTypeId` (`dishTypeId`),
  CONSTRAINT `dishes_dishTypes_ibfk_1` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE,
  CONSTRAINT `dishes_dishTypes_ibfk_2` FOREIGN KEY (`dishTypeId`) REFERENCES `dishTypes` (`dishTypeId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dishes_tags` (
  `dishId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tagId` int NOT NULL,
  PRIMARY KEY (`dishId`,`tagId`),
  KEY `tagId` (`tagId`),
  CONSTRAINT `dishes_tags_ibfk_1` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE,
  CONSTRAINT `dishes_tags_ibfk_2` FOREIGN KEY (`tagId`) REFERENCES `tags` (`tagId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `userFavorites` (
  `userId` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dishId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` int NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`userId`, `position`),
  UNIQUE KEY `idx_userFavorites_dish` (`userId`, `dishId`),
  KEY `idx_userFavorites_userId` (`userId`),
  CONSTRAINT `fk_userFavorites_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `fk_userFavorites_dish` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `userFollows` (
  `followerId` varchar(36) NOT NULL,
  `followingId` varchar(36) NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`followerId`, `followingId`),
  KEY `idx_userFollows_followingId` (`followingId`),
  CONSTRAINT `fk_userFollows_follower` FOREIGN KEY (`followerId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `fk_userFollows_following` FOREIGN KEY (`followingId`) REFERENCES `users` (`userId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `userWatchlist` (
  `userId` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dishId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`userId`, `dishId`),
  KEY `idx_userWatchlist_userId` (`userId`),
  KEY `idx_userWatchlist_dishId` (`dishId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS `search_terms` (
  `searchTermId` int NOT NULL AUTO_INCREMENT,
  `term` varchar(100) NOT NULL,
  `mappings` json NOT NULL COMMENT 'AI-generated mappings: { categories: [{id, weight}], dishTypes: [{id, weight}], tags: [{id, weight}] }',
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`searchTermId`),
  UNIQUE KEY `idx_search_terms_term` (`term`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS file_framing (
    fileId varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
    framing longtext COLLATE utf8mb4_unicode_ci NOT NULL,
    updatedAt bigint NOT NULL,
    PRIMARY KEY (fileId),
    CONSTRAINT fk_file_framing_file FOREIGN KEY (fileId) REFERENCES files(fileId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
