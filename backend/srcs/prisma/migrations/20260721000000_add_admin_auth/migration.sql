-- Authentification admin autonome (découplée d'OAuth 42)
-- 3 tables : passkeys WebAuthn de l'owner, délégués (logins 42 autorisés à éditer
-- les SEULS secrets 42), et journal d'audit des actions admin. Aucune donnée
-- chiffrée ici (clé PUBLIQUE WebAuthn, login délégué, journal).

-- CreateTable
CREATE TABLE `admin_credential` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `credentialId` VARCHAR(512) NOT NULL,
    `publicKey` TEXT NOT NULL,
    `counter` INTEGER NOT NULL DEFAULT 0,
    `transports` VARCHAR(255) NULL,
    `label` VARCHAR(128) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `admin_credential_credentialId_key`(`credentialId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_delegate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `login42` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_delegate_login42_key`(`login42`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_audit_event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actor` VARCHAR(128) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `detail` TEXT NULL,

    INDEX `admin_audit_event_at_idx`(`at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
