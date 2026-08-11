/**
 * A template is a partial automation + presentation metadata. Applying a
 * template pre-fills the create-automation form with name/prompt/agent/rrule;
 * device, project, and timezone still come from the user's current selection.
 */
export interface AutomationTemplate {
	id: string;
	// --- presentation ---
	emoji: string;
	description: string;
	// --- automation defaults ---
	name: string;
	prompt: string;
	agentType?: string;
	rrule?: string;
}

export interface AutomationTemplateCategory {
	id: string;
	label: string;
	templates: AutomationTemplate[];
}

const DAILY_9AM = "FREQ=DAILY;BYHOUR=9;BYMINUTE=0";
const WEEKDAYS_9AM = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0";
const WEEKLY_MONDAY_9AM = "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0";
const WEEKLY_FRIDAY_5PM = "FREQ=WEEKLY;BYDAY=FR;BYHOUR=17;BYMINUTE=0";

export const AUTOMATION_TEMPLATE_CATEGORIES: AutomationTemplateCategory[] = [
	{
		id: "status-reports",
		label: "Status reports",
		templates: [
			{
				id: "standup",
				emoji: "🟣",
				description: "Summarize yesterday's git activity for standup.",
				name: "Daily standup digest",
				prompt:
					"Summarize yesterday's git activity in this repo for a standup. Group by author. Call out blockers and anything that didn't land.",
				rrule: WEEKDAYS_9AM,
			},
			{
				id: "weekly-pr-digest",
				emoji: "📝",
				description:
					"Synthesize this week's PRs, rollouts, incidents, and reviews into a weekly update.",
				name: "Weekly team update",
				prompt:
					"Synthesize this week's merged PRs, rollouts, incidents, and reviews into a concise weekly update. Group by theme. Link each item.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
			{
				id: "team-pr-recap",
				emoji: "🗞️",
				description:
					"Summarize last week's PRs by teammate and theme; highlight risks.",
				name: "Weekly PR recap",
				prompt:
					"Summarize last week's PRs grouped by teammate and theme. Highlight risks, regressions, and anything needing follow-up.",
				rrule: WEEKLY_MONDAY_9AM,
			},
		],
	},
	{
		id: "release-prep",
		label: "Release prep",
		templates: [
			{
				id: "release-notes",
				emoji: "📖",
				description:
					"Draft weekly release notes from merged PRs (include links when available).",
				name: "Weekly release notes draft",
				prompt:
					"Draft release notes for the last 7 days of merged PRs. Group by feature / fix / chore. Include PR links when available.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
			{
				id: "pre-release-check",
				emoji: "✅",
				description:
					"Before tagging, verify changelog, migrations, feature flags, and tests.",
				name: "Pre-release audit",
				prompt:
					"Pre-release audit: verify the changelog is up to date, pending migrations have been run, feature flags default correctly, and tests are green. Flag anything that should block the release.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
			{
				id: "changelog-update",
				emoji: "✏️",
				description:
					"Update the changelog with this week's highlights and key PR links.",
				name: "Changelog refresh",
				prompt:
					"Update CHANGELOG.md with this week's highlights. Include key PR links and keep the tone consistent with previous entries.",
				rrule: WEEKLY_FRIDAY_5PM,
			},
		],
	},
	{
		id: "quality",
		label: "Quality & health",
		templates: [
			{
				id: "bug-scan",
				emoji: "🐞",
				description:
					"Scan recent commits (since the last run, or last 24h) for likely bugs and propose minimal fixes.",
				name: "Daily bug scan",
				prompt:
					"Scan commits from the last 24 hours for likely bugs, regressions, or unsafe patterns. Propose minimal fixes with diffs where possible.",
				rrule: DAILY_9AM,
			},
			{
				id: "ci-failures",
				emoji: "🧪",
				description:
					"Summarize CI failures and flaky tests from the last CI window; suggest top fixes.",
				name: "CI health digest",
				prompt:
					"Summarize CI failures and flaky tests from the last 24 hours. Group by root cause. Suggest the top three fixes to make.",
				rrule: DAILY_9AM,
			},
			{
				id: "benchmark-regressions",
				emoji: "👍",
				description:
					"Compare recent changes to benchmarks or traces and flag regressions early.",
				name: "Benchmark regression watch",
				prompt:
					"Compare recent changes against benchmarks and traces. Flag regressions early and suggest which commits to investigate first.",
				rrule: DAILY_9AM,
			},
		],
	},
	{
		id: "growth",
		label: "Growth",
		templates: [
			{
				id: "skill-deepening",
				emoji: "🌳",
				description:
					"From recent PRs and reviews, suggest next skills to deepen.",
				name: "Skill growth suggestions",
				prompt:
					"Based on my recent PRs and code review comments, suggest 3–5 skills I should deepen next quarter. Be concrete and link evidence.",
				rrule: WEEKLY_MONDAY_9AM,
			},
			{
				id: "small-side-project",
				emoji: "🎮",
				description: "Create a small classic game with minimal scope.",
				name: "Weekend side project",
				prompt:
					"Scaffold a small classic game (snake, pong, minesweeper, etc.) with minimal scope. Use whatever language fits this repo. Keep it to one file if possible.",
			},
		],
	},
];

export const AUTOMATION_TEMPLATES_FLAT: AutomationTemplate[] =
	AUTOMATION_TEMPLATE_CATEGORIES.flatMap((category) => category.templates);

const DAILY_8AM = "FREQ=DAILY;BYHOUR=8;BYMINUTE=0";
const WEEKLY_WEDNESDAY_9AM = "FREQ=WEEKLY;BYDAY=WE;BYHOUR=9;BYMINUTE=0";
const WEEKLY_FRIDAY_4PM = "FREQ=WEEKLY;BYDAY=FR;BYHOUR=16;BYMINUTE=0";

/**
 * First-run suggestions: the description is a complete sentence a user could
 * have typed themselves (Zapier's "automation ideas" pattern) — clicking a
 * card pre-fills the create form with the matching prompt + schedule.
 * See plans/automations-onboarding.md.
 */
export const ONBOARDING_SUGGESTIONS: AutomationTemplate[] = [
	{
		id: "onboard-fix-ci",
		emoji: "🔧",
		description:
			"Each morning at 8am, look at yesterday's failed CI runs, diagnose the most common failure, and open a fix PR.",
		name: "Fix CI failures",
		prompt:
			"Look at yesterday's failed CI runs on the default branch. Diagnose the most common failure, fix the root cause, run the affected checks locally, and open a PR with the fix. If nothing failed, say so and stop.",
		rrule: DAILY_8AM,
	},
	{
		id: "onboard-triage-issues",
		emoji: "🏷️",
		description:
			"Every weekday at 9am, read new GitHub issues, apply labels, and draft a first reply for my review.",
		name: "Triage new issues",
		prompt:
			"Read GitHub issues opened since the last run. For each: apply appropriate labels, check for duplicates, and draft (do not post) a first reply for my review. Summarize what needs my attention most.",
		rrule: WEEKDAYS_9AM,
	},
	{
		id: "onboard-docs-fresh",
		emoji: "📚",
		description:
			"Every Wednesday at 9am, review this week's merged PRs and update any docs they made stale.",
		name: "Keep docs fresh",
		prompt:
			"Review this week's merged PRs. Find documentation that they made stale or incomplete, update it, and open a PR. Skip trivial changes; focus on user-facing behavior.",
		rrule: WEEKLY_WEDNESDAY_9AM,
	},
	{
		id: "onboard-release-notes",
		emoji: "🗒️",
		description:
			"Every Friday at 4pm, draft release notes from this week's merged PRs.",
		name: "Weekly release notes",
		prompt:
			"Draft release notes from this week's merged PRs. Group by feature/fix/internal, write one plain-language line per item, and link each PR. Leave the draft in the workspace for my review.",
		rrule: WEEKLY_FRIDAY_4PM,
	},
];
