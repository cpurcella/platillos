CREATE TABLE IF NOT EXISTS file_framing (
    fileId varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
    framing longtext COLLATE utf8mb4_unicode_ci NOT NULL,
    updatedAt bigint NOT NULL,
    PRIMARY KEY (fileId),
    CONSTRAINT fk_file_framing_file FOREIGN KEY (fileId) REFERENCES files(fileId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
