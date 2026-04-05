ALTER TABLE `advisor_request_logs`
  ADD COLUMN `request_json` JSON NULL,
  ADD COLUMN `result_json` JSON NULL;
