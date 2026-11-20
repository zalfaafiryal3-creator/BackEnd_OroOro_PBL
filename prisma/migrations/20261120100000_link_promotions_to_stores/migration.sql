ALTER TABLE `Promotion`
    ADD COLUMN `store_id` INTEGER NULL,
    ADD INDEX `Promotion_store_id_idx`(`store_id`),
    ADD CONSTRAINT `Promotion_store_id_fkey`
        FOREIGN KEY (`store_id`) REFERENCES `Store`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `Promotion` AS p
JOIN (
    SELECT `name`, MIN(`id`) AS `id`
    FROM `Store`
    GROUP BY `name`
    HAVING COUNT(*) = 1
) AS s ON s.`name` = p.`store`
SET p.`store_id` = s.`id`;
