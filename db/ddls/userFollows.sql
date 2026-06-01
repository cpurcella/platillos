CREATE TABLE `userFollows` (
  `followerId` varchar(36) NOT NULL,
  `followingId` varchar(36) NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`followerId`, `followingId`),
  KEY `idx_userFollows_followingId` (`followingId`),
  CONSTRAINT `fk_userFollows_follower` FOREIGN KEY (`followerId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `fk_userFollows_following` FOREIGN KEY (`followingId`) REFERENCES `users` (`userId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
