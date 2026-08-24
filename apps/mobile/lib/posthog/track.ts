import { posthog } from "./client";

/** What PostHog accepts as a property value. Events here are all flat. */
type EventProperties = Record<string, string | number | boolean | null>;

/**
 * Every event mobile sends. Desktop's names are reused wherever the action is
 * the same, so its funnels split by `surface` instead of needing a parallel
 * mobile dashboard; the rest are mobile's own, for screens desktop has no
 * equivalent of.
 */
export type MobileEvent =
	// Core loop
	| "chat_message_sent"
	| "agent_session_launch"
	| "session_opened"
	| "session_switched"
	| "terminal_input_submitted"
	| "terminal_connect_failed"
	// New-session funnel
	| "new_session_started"
	| "new_session_project_selected"
	| "new_session_branch_selected"
	| "new_session_agent_selected"
	| "workspace_created"
	| "workspace_create_enqueued"
	| "workspace_create_failed"
	// Composer
	| "attachments_sheet_opened"
	| "attachment_added"
	| "attachment_removed"
	| "composer_draft_restored"
	| "composer_draft_discarded"
	// Pull request review
	| "pull_request_opened"
	| "files_changed_viewed"
	| "file_viewed"
	| "line_comment_added"
	| "review_submitted"
	| "commits_viewed"
	// Navigation
	| "filter_applied";

/**
 * `surface: "mobile"` and `app_name` ride along on every event as registered
 * super properties — see PostHogProvider — so callers pass only what is
 * specific to the event.
 */
export function track(event: MobileEvent, properties?: EventProperties): void {
	posthog.capture(event, properties);
}
