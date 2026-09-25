-- Backfill resume args for agent configs created before the column existed.
-- Only rows still at the untouched default are filled (resume args shipped
-- with this migration set, so no user has customized them yet). Values are
-- the bundled preset defaults frozen at migration time. Every bundled
-- preset's binary equals its preset id, so `command = preset_id` skips rows
-- whose command was repointed at a different CLI (and custom rows that merely
-- reuse a builtin preset_id tag).
UPDATE `host_agent_configs` SET `resume_args_json` = '["--resume"]' WHERE `resume_args_json` = '[]' AND `command` = `preset_id` AND `preset_id` IN ('claude', 'gemini', 'copilot', 'vibe', 'grok', 'cursor-agent', 'droid');--> statement-breakpoint
UPDATE `host_agent_configs` SET `resume_args_json` = '["threads","continue"]' WHERE `resume_args_json` = '[]' AND `command` = `preset_id` AND `preset_id` = 'amp';--> statement-breakpoint
UPDATE `host_agent_configs` SET `resume_args_json` = '["resume"]' WHERE `resume_args_json` = '[]' AND `command` = `preset_id` AND `preset_id` = 'codex';--> statement-breakpoint
UPDATE `host_agent_configs` SET `resume_args_json` = '["--thread"]' WHERE `resume_args_json` = '[]' AND `command` = `preset_id` AND `preset_id` = 'mastracode';--> statement-breakpoint
UPDATE `host_agent_configs` SET `resume_args_json` = '["--session"]' WHERE `resume_args_json` = '[]' AND `command` = `preset_id` AND `preset_id` IN ('opencode', 'pi', 'kimi');
