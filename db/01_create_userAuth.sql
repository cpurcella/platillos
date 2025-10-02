-- 1. Create the new userAuth table
CREATE TABLE userAuth (
    userId VARCHAR(36) NOT NULL PRIMARY KEY,
    password VARCHAR(255) NOT NULL,
    emailToken VARCHAR(64),
    phoneCode VARCHAR(16)
);
