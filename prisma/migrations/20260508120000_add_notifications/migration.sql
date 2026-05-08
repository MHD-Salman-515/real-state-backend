CREATE TABLE IF NOT EXISTS `notifications` (
  `id`        INT AUTO_INCREMENT PRIMARY KEY,
  `userId`    INT NOT NULL,
  `type`      VARCHAR(50) NOT NULL,
  `title`     VARCHAR(200) NOT NULL,
  `body`      TEXT NOT NULL,
  `isRead`    BOOLEAN NOT NULL DEFAULT FALSE,
  `metadata`  JSON NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `notifications_userId_idx` (`userId`),
  INDEX `notifications_userId_isRead_idx` (`userId`, `isRead`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);
