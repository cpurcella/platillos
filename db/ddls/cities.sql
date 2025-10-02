CREATE TABLE `cities` (
  `cityId` int NOT NULL AUTO_INCREMENT,
  `state` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lat` decimal(12,9) NOT NULL,
  `lng` decimal(12,9) NOT NULL,
  PRIMARY KEY (`cityId`)
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci