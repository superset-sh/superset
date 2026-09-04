import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/**
 * A template is a partial automation + presentation metadata. Selecting a
 * template creates the automation with its name/prompt/agent/rrule and opens
 * the detail page; device, project, and timezone come from the user's setup.
 */
export interface AutomationTemplate {
	id: string;
	// --- presentation ---
	emoji: string;
	description: MessageDescriptor;
	// --- automation defaults ---
	name: MessageDescriptor;
	prompt: string;
	agentType?: string;
	rrule?: string;
}

const WEEKDAYS_9AM = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0";
const DAILY_8AM = "FREQ=DAILY;BYHOUR=8;BYMINUTE=0";
const WEEKLY_WEDNESDAY_9AM = "FREQ=WEEKLY;BYDAY=WE;BYHOUR=9;BYMINUTE=0";
const WEEKLY_FRIDAY_4PM = "FREQ=WEEKLY;BYDAY=FR;BYHOUR=16;BYMINUTE=0";

/**
 * First-run suggestions: the description is a complete sentence a user could
 * have typed themselves (Zapier's "automation ideas" pattern) — clicking a
 * card creates the automation with the matching prompt + schedule.
 * See plans/automations-onboarding.md.
 */
export const ONBOARDING_SUGGESTIONS: AutomationTemplate[] = [
	{
		id: "onboard-fix-ci",
		emoji: "🔧",
		description: msg({
			message:
				"Each morning at 8am, look at yesterday's failed CI runs, diagnose the most common failure, and open a fix PR.",
		}),
		name: msg({
			message: "Fix CI failures",
		}),
		prompt:
			"Look at yesterday's failed CI runs on the default branch. Diagnose the most common failure, fix the root cause, run the affected checks locally, and open a PR with the fix. If nothing failed, say so and stop.",
		rrule: DAILY_8AM,
	},
	{
		id: "onboard-triage-issues",
		emoji: "🏷️",
		description: msg({
			message:
				"Every weekday at 9am, read new GitHub issues, apply labels, and draft a first reply for my review.",
		}),
		name: msg({
			message: "Triage new issues",
		}),
		prompt:
			"Read GitHub issues opened since the last run. For each: apply appropriate labels, check for duplicates, and draft (do not post) a first reply for my review. Summarize what needs my attention most.",
		rrule: WEEKDAYS_9AM,
	},
	{
		id: "onboard-docs-fresh",
		emoji: "📚",
		description: msg({
			message:
				"Every Wednesday at 9am, review this week's merged PRs and update any docs they made stale.",
		}),
		name: msg({
			message: "Keep docs fresh",
		}),
		prompt:
			"Review this week's merged PRs. Find documentation that they made stale or incomplete, update it, and open a PR. Skip trivial changes; focus on user-facing behavior.",
		rrule: WEEKLY_WEDNESDAY_9AM,
	},
	{
		id: "onboard-release-notes",
		emoji: "🗒️",
		description: msg({
			message:
				"Every Friday at 4pm, draft release notes from this week's merged PRs.",
		}),
		name: msg({
			message: "Weekly release notes",
		}),
		prompt:
			"Draft release notes from this week's merged PRs. Group by feature/fix/internal, write one plain-language line per item, and link each PR. Leave the draft in the workspace for my review.",
		rrule: WEEKLY_FRIDAY_4PM,
	},
];
