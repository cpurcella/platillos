-- 2. Migrate sensitive data from users to userAuth
INSERT INTO userAuth (userId, password, emailToken, phoneCode)
SELECT userId, password, emailToken, phoneCode FROM users;
