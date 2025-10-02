CREATE TABLE `dishes_dishTypes` (
  `dishId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `dishTypeId` int NOT NULL,
  PRIMARY KEY (`dishId`,`dishTypeId`),
  KEY `dishTypeId` (`dishTypeId`),
  CONSTRAINT `dishes_dishTypes_ibfk_1` FOREIGN KEY (`dishId`) REFERENCES `dishes` (`dishId`) ON DELETE CASCADE,
  CONSTRAINT `dishes_dishTypes_ibfk_2` FOREIGN KEY (`dishTypeId`) REFERENCES `dishTypes` (`dishTypeId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci