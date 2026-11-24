-- AlterTable: Add aspect rating columns to Review table for market reviews
ALTER TABLE `Review`
  ADD COLUMN `rating_cleanliness`  INTEGER NULL,
  ADD COLUMN `rating_variety`      INTEGER NULL,
  ADD COLUMN `rating_hospitality`  INTEGER NULL,
  ADD COLUMN `rating_parking`      INTEGER NULL;
