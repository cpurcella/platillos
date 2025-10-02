CREATE TABLE `dishes_tags` (
  `dishId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tagId` int NOT NULL,
  PRIMARY KEY (`dishId`,`tagId`),
  KEY `tagId` (`tagId`),
  CONSTRAINT `dishes_tags_ibfk_1` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE,
  CONSTRAINT `dishes_tags_ibfk_2` FOREIGN KEY (`tagId`) REFERENCES `tags` (`tagId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci