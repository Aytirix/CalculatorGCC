-- CreateTable
CREATE TABLE `configuration` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `clientId42` TEXT NOT NULL DEFAULT '',
    `clientSecret42` TEXT NOT NULL DEFAULT '',
    `setupToken` VARCHAR(128) NULL,
    `isConfigured` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_simulation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId42` INTEGER NOT NULL,
    `login` VARCHAR(64) NOT NULL,
    `simulatedSubProjects` JSON NULL,
    `customProjects` JSON NULL,
    `manualExperiences` JSON NULL,
    `apiExpPercentages` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_simulation_userId42_key`(`userId42`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `simulated_project` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId42` INTEGER NOT NULL,
    `projectId` VARCHAR(128) NOT NULL,
    `percentage` INTEGER NOT NULL DEFAULT 100,
    `coalitionBoost` BOOLEAN NOT NULL DEFAULT false,
    `note` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `simulated_project_projectId_idx`(`projectId`),
    UNIQUE INDEX `simulated_project_userId42_projectId_key`(`userId42`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `simulated_project` ADD CONSTRAINT `simulated_project_userId42_fkey` FOREIGN KEY (`userId42`) REFERENCES `user_simulation`(`userId42`) ON DELETE CASCADE ON UPDATE CASCADE;

