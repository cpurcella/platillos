DELIMITER //
CREATE PROCEDURE create_missing_indexes()
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND INDEX_NAME = 'idx_reviews_approved_submitted'
	) THEN
		SET @s = 'CREATE INDEX idx_reviews_approved_submitted ON reviews (approved, submitted)';
		PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews_photos' AND INDEX_NAME = 'idx_reviews_photos_reviewId'
	) THEN
		SET @s = 'CREATE INDEX idx_reviews_photos_reviewId ON reviews_photos (reviewId)';
		PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews_photos' AND INDEX_NAME = 'idx_reviews_photos_fileId'
	) THEN
		SET @s = 'CREATE INDEX idx_reviews_photos_fileId ON reviews_photos (fileId)';
		PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurants' AND INDEX_NAME = 'idx_restaurants_coords'
	) THEN
		SET @s = 'ALTER TABLE restaurants ADD SPATIAL INDEX idx_restaurants_coords (coords)';
		PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
	END IF;
END;
//
CALL create_missing_indexes();
DROP PROCEDURE create_missing_indexes;
//
DELIMITER ;
