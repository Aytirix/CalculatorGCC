-- CreateTable
CREATE TABLE `user_data_42` (
    `userId42` INTEGER NOT NULL,
    `level` DOUBLE NOT NULL DEFAULT 0,
    `eventsCount` INTEGER NOT NULL DEFAULT 0,
    `projects` JSON NULL,
    `allProjects` JSON NULL,
    `allCursus` JSON NULL,
    `allEvents` JSON NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId42`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
