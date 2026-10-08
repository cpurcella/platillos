-- Match the 1–10 rating input, which accepts one decimal place.
ALTER TABLE reviews MODIFY rating decimal(3,1) NOT NULL;
ALTER TABLE userDishLog MODIFY rating decimal(3,1) DEFAULT NULL;
