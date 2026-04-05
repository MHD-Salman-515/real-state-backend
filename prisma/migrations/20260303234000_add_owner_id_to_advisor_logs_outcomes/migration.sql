ALTER TABLE `advisor_request_logs`
  ADD COLUMN `owner_id` INT NULL;

CREATE INDEX `advisor_request_logs_owner_id_created_at_idx`
  ON `advisor_request_logs` (`owner_id`, `created_at`);

ALTER TABLE `advisor_outcomes`
  ADD COLUMN `owner_id` INT NULL;

CREATE INDEX `advisor_outcomes_owner_id_created_at_idx`
  ON `advisor_outcomes` (`owner_id`, `created_at`);
