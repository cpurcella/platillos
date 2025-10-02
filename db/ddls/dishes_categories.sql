CREATE TABLE `dishes_categories` (
  `dishId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoryId` int NOT NULL,
  PRIMARY KEY (`dishId`,`categoryId`),
  KEY `categoryId` (`categoryId`),
  CONSTRAINT `dishes_categories_ibfk_1` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE,
  CONSTRAINT `dishes_categories_ibfk_2` FOREIGN KEY (`categoryId`) REFERENCES `categories` (`categoryId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci