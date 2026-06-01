ALTER TABLE dishes
  ADD COLUMN itemType varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'food' AFTER name,
  ADD KEY idx_dishes_itemType_status (itemType, status);

INSERT INTO categories (category)
SELECT 'Cocktail' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE category = 'Cocktail');
INSERT INTO categories (category)
SELECT 'Beer' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE category = 'Beer');
INSERT INTO categories (category)
SELECT 'Wine' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE category = 'Wine');
INSERT INTO categories (category)
SELECT 'Spirits' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE category = 'Spirits');
INSERT INTO categories (category)
SELECT 'Non-Alcoholic' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE category = 'Non-Alcoholic');

INSERT INTO dishTypes (dishType)
SELECT 'Margarita' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Margarita');
INSERT INTO dishTypes (dishType)
SELECT 'Old Fashioned' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Old Fashioned');
INSERT INTO dishTypes (dishType)
SELECT 'Martini' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Martini');
INSERT INTO dishTypes (dishType)
SELECT 'Negroni' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Negroni');
INSERT INTO dishTypes (dishType)
SELECT 'House Cocktail' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'House Cocktail');
INSERT INTO dishTypes (dishType)
SELECT 'Lager' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Lager');
INSERT INTO dishTypes (dishType)
SELECT 'IPA' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'IPA');
INSERT INTO dishTypes (dishType)
SELECT 'Stout' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Stout');
INSERT INTO dishTypes (dishType)
SELECT 'Pilsner' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Pilsner');
INSERT INTO dishTypes (dishType)
SELECT 'Sour' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Sour');
INSERT INTO dishTypes (dishType)
SELECT 'Cider' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Cider');
INSERT INTO dishTypes (dishType)
SELECT 'Mocktail' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Mocktail');
INSERT INTO dishTypes (dishType)
SELECT 'Daiquiri' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Daiquiri');
INSERT INTO dishTypes (dishType)
SELECT 'Mojito' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Mojito');
INSERT INTO dishTypes (dishType)
SELECT 'Manhattan' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Manhattan');
INSERT INTO dishTypes (dishType)
SELECT 'Paloma' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Paloma');
INSERT INTO dishTypes (dishType)
SELECT 'Moscow Mule' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Moscow Mule');
INSERT INTO dishTypes (dishType)
SELECT 'Espresso Martini' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Espresso Martini');
INSERT INTO dishTypes (dishType)
SELECT 'Aperol Spritz' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Aperol Spritz');
INSERT INTO dishTypes (dishType)
SELECT 'Pale Ale' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Pale Ale');
INSERT INTO dishTypes (dishType)
SELECT 'Hazy IPA' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Hazy IPA');
INSERT INTO dishTypes (dishType)
SELECT 'Wheat Beer' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Wheat Beer');
INSERT INTO dishTypes (dishType)
SELECT 'Porter' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Porter');
INSERT INTO dishTypes (dishType)
SELECT 'Amber Ale' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Amber Ale');
INSERT INTO dishTypes (dishType)
SELECT 'Saison' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Saison');
INSERT INTO dishTypes (dishType)
SELECT 'Gose' WHERE NOT EXISTS (SELECT 1 FROM dishTypes WHERE dishType = 'Gose');

INSERT INTO tags (tag)
SELECT 'citrus' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'citrus');
INSERT INTO tags (tag)
SELECT 'smoky' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'smoky');
INSERT INTO tags (tag)
SELECT 'spirit-forward' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'spirit-forward');
INSERT INTO tags (tag)
SELECT 'bitter' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'bitter');
INSERT INTO tags (tag)
SELECT 'draft' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'draft');
INSERT INTO tags (tag)
SELECT 'local' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'local');
INSERT INTO tags (tag)
SELECT 'seasonal' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'seasonal');
INSERT INTO tags (tag)
SELECT 'low-ABV' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'low-ABV');
INSERT INTO tags (tag)
SELECT 'fruity' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'fruity');
INSERT INTO tags (tag)
SELECT 'spicy' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'spicy');
INSERT INTO tags (tag)
SELECT 'sweet' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'sweet');
INSERT INTO tags (tag)
SELECT 'herbal' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'herbal');
INSERT INTO tags (tag)
SELECT 'floral' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'floral');
INSERT INTO tags (tag)
SELECT 'tart' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'tart');
INSERT INTO tags (tag)
SELECT 'dry' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'dry');
INSERT INTO tags (tag)
SELECT 'crisp' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'crisp');
INSERT INTO tags (tag)
SELECT 'refreshing' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'refreshing');
INSERT INTO tags (tag)
SELECT 'hoppy' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'hoppy');
INSERT INTO tags (tag)
SELECT 'malty' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'malty');
INSERT INTO tags (tag)
SELECT 'roasty' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'roasty');
INSERT INTO tags (tag)
SELECT 'on-tap' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'on-tap');
INSERT INTO tags (tag)
SELECT 'bottled' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'bottled');
INSERT INTO tags (tag)
SELECT 'sparkling' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'sparkling');
INSERT INTO tags (tag)
SELECT 'frozen' WHERE NOT EXISTS (SELECT 1 FROM tags WHERE tag = 'frozen');