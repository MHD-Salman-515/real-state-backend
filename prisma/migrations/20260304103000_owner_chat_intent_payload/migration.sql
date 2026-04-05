ALTER TABLE `chat_messages`
  ADD COLUMN `intent` VARCHAR(64) NULL,
  ADD COLUMN `payload_json` JSON NULL;

CREATE INDEX `chat_messages_session_id_intent_idx`
  ON `chat_messages`(`session_id`, `intent`);
