-- 3. Remove sensitive columns from users table
ALTER TABLE users
    DROP COLUMN password,
    DROP COLUMN emailToken,
    DROP COLUMN phoneCode;
