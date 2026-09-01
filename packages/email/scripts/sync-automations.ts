/**
 * Syncs the Resend lifecycle automations to the graphs defined below, so the
 * production email flows are versioned here instead of living only in the
 * Resend dashboard.
 *
 * Usage (dry-run by default, pass --apply to mutate):
 *   RESEND_API_KEY=... bun scripts/sync-automations.ts [--apply] [--force]
 *
 * Four hard-won rules this script encodes:
 * - ONLY `user.signed_up` is safe as a trigger: it fires once per user, from
 *   better-auth's `user.create.after` hook. `user.activated` fires on every
 *   workspace create and `app.first_opened` on every first-host/onboarding
 *   path, so triggering on either enrols a user once per occurrence. Pointing
 *   habit-drip's trigger at `user.activated` sent 1,487 copies of one email to
 *   230 people on 2026-08-21. Repeating events belong in `wait_for_event`,
 *   which absorbs duplicates. Events fan out to every matching consumer, so
 *   any number of automations can wait on the same one.
 * - GATING an emitter is the mirror of that rule: it hits every consumer. The
 *   signup hook withholds `user.signed_up` from the activation A/B's control
 *   arm, so a second automation triggering on it would silently lose that arm
 *   too. That is why only activation-drip is defined here. Before adding
 *   another `user.signed_up` trigger, split enrolment into its own event.
 * - NEVER update an enabled automation's steps: despite the API's wording,
 *   doing so cancelled every in-flight run (2026-08-20, ~324 users dropped
 *   mid-drip). Migration is create-new-enabled, then stop (not edit) the old
 *   one; its in-flight runs finish on the old graph.
 * - `wait_for_event` only matches events that arrive DURING the wait, so the
 *   activation graph listens for `app.first_opened` from signup (it fires
 *   within an hour for ~77% of signups, via user.completeOnboarding). Only
 *   run this after the emitter (PR #6702) is deployed, or day-old activated
 *   users will get the download nudge.
 */
import { Resend } from "resend";

type Step = {
	key: string;
	type: "trigger" | "wait_for_event" | "delay" | "send_email";
	config: Record<string, unknown>;
};
type Connection = {
	from: string;
	to: string;
	type: "default" | "event_received" | "timeout";
};
type DesiredAutomation = {
	name: string;
	steps: Step[];
	connections: Connection[];
};

const resend = new Resend(process.env.RESEND_API_KEY);
const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");

const aliasIds = new Map<string, string>();
const templates = await resend.templates.list({ limit: 100 });
if (templates.error) throw new Error(templates.error.message);
for (const t of (templates.data?.data ?? []) as Array<{
	id: string;
	alias?: string;
}>) {
	if (t.alias) aliasIds.set(t.alias, t.id);
}
function template(alias: string, variables?: Record<string, unknown>) {
	const id = aliasIds.get(alias);
	if (!id) throw new Error(`no published template with alias ${alias}`);
	return variables ? { id, variables } : { id };
}

const desired: DesiredAutomation[] = [
	{
		// Signup drip. Listens for first-open from minute zero; a user with no
		// first-open event by day 1 cannot have activated (onboarding precedes
		// workspace creation), so the download branch needs no activation guard.
		name: "activation-drip",
		steps: [
			{
				key: "start",
				type: "trigger",
				config: { eventName: "user.signed_up" },
			},
			{
				key: "wait_install",
				type: "wait_for_event",
				config: { eventName: "app.first_opened", timeout: "1 day" },
			},
			{
				key: "wait_activation_installed",
				type: "wait_for_event",
				config: { eventName: "user.activated", timeout: "23 hours" },
			},
			{
				key: "send_first_prompt",
				type: "send_email",
				config: { template: template("activation-01b-first-prompt") },
			},
			{
				key: "send_first_agent",
				type: "send_email",
				config: { template: template("activation-01-first-agent") },
			},
			{
				key: "wait_activation_2",
				type: "wait_for_event",
				config: { eventName: "user.activated", timeout: "5 days" },
			},
			{
				key: "send_founder_note",
				type: "send_email",
				config: {
					template: template("activation-02-founder-note", {
						name: { var: "event.name" },
					}),
				},
			},
		],
		connections: [
			{ from: "start", to: "wait_install", type: "default" },
			{
				from: "wait_install",
				to: "wait_activation_installed",
				type: "event_received",
			},
			{ from: "wait_install", to: "send_first_agent", type: "timeout" },
			{
				from: "wait_activation_installed",
				to: "send_first_prompt",
				type: "timeout",
			},
			{ from: "send_first_prompt", to: "wait_activation_2", type: "default" },
			{ from: "send_first_agent", to: "wait_activation_2", type: "default" },
			{ from: "wait_activation_2", to: "send_founder_note", type: "timeout" },
		],
	},
];

// The API returns snake_case config keys and normalized durations
// ("1 week 5 days" for "12 days"), so comparison canonicalizes both sides.
function canonDuration(v: string): string {
	const units: Record<string, number> = {
		minute: 60,
		hour: 3600,
		day: 86400,
		week: 604800,
	};
	let seconds = 0;
	for (const m of v.matchAll(/(\d+)\s*(minute|hour|day|week)s?/g)) {
		seconds += Number(m[1]) * (units[m[2] ?? ""] ?? 0);
	}
	return String(seconds || v);
}
function canonConfig(c: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(c)) {
		const key = k === "event_name" ? "eventName" : k;
		out[key] =
			(key === "timeout" || key === "duration") && typeof v === "string"
				? canonDuration(v)
				: v;
	}
	return out;
}
function canonGraph(steps: Step[], connections: Connection[]): string {
	return JSON.stringify({
		steps: steps
			.map((s) => ({ key: s.key, type: s.type, config: canonConfig(s.config) }))
			.sort((a, b) => a.key.localeCompare(b.key)),
		connections: [...connections].sort((a, b) =>
			`${a.from}>${a.to}`.localeCompare(`${b.from}>${b.to}`),
		),
	});
}

const listed = await resend.automations.list({ limit: 100 });
if (listed.error) throw new Error(listed.error.message);
const existing = (listed.data?.data ?? []) as Array<{
	id: string;
	name: string;
	status: string;
}>;

for (const want of desired) {
	const sameName = existing.filter((a) => a.name === want.name);
	const live = sameName.filter((a) => a.status === "enabled");
	const wantCanon = canonGraph(want.steps, want.connections);
	const matching = [];
	for (const a of live) {
		const full = await resend.automations.get(a.id);
		if (full.error || !full.data)
			throw new Error(`get ${a.id}: ${full.error?.message}`);
		const got = canonGraph(
			full.data.steps as Step[],
			full.data.connections as Connection[],
		);
		if (got === wantCanon) matching.push(a);
	}

	if (matching.length > 0) {
		console.log(`${want.name}: up to date (${matching[0]?.id})`);
		continue;
	}

	// A same-named automation sitting disabled means someone stopped it on
	// purpose, usually mid-incident. Recreating it here would silently re-arm
	// the thing they turned off, so make that an explicit choice.
	const stopped = sameName.filter((a) => a.status !== "enabled");
	if (live.length === 0 && stopped.length > 0 && !force) {
		const ids = stopped.map((a) => a.id).join(", ");
		throw new Error(
			`${want.name}: ${stopped.length} disabled automation(s) exist (${ids}). Creating would re-arm what someone stopped. Re-run with --force if that is intended.`,
		);
	}

	console.log(
		`${want.name}: ${live.length ? `replacing ${live.map((a) => a.id).join(", ")}` : "creating"}${apply ? "" : " (dry-run, pass --apply)"}`,
	);
	if (!apply) continue;

	const created = await resend.automations.create({
		name: want.name,
		status: "enabled",
		steps: want.steps as never,
		connections: want.connections,
	});
	if (created.error || !created.data) {
		throw new Error(`create ${want.name}: ${created.error?.message}`);
	}
	console.log(`  created ${created.data.id} (enabled)`);

	for (const old of live) {
		const stopped = await resend.automations.stop(old.id);
		if (stopped.error)
			throw new Error(`stop ${old.id}: ${stopped.error.message}`);
		console.log(
			`  stopped ${old.id}; its in-flight runs finish on the old graph`,
		);
	}
}
