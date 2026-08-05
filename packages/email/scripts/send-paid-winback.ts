#!/usr/bin/env bun
// Gated one-off send script for the churned-Pro win-back backlog (SUPER-1626).
// Plain-text founder 1:1 emails; template copy from the #founders resurrection
// list handoff (2026-07-24). Changelog items are CLI-provided via --changelog.
//
// Usage:
//   bun run scripts/send-paid-winback.ts --csv winback.csv --dry-run
//   bun run scripts/send-paid-winback.ts --csv winback.csv --changelog="tasks, mobile app, CLI v2" --test=satya@superset.sh
//   bun run scripts/send-paid-winback.ts --csv winback.csv --changelog="tasks, mobile app, CLI v2" --from=satya@superset.sh --send

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { format } from "date-fns";
import { Resend } from "resend";

const SENT_LOG_PATH = fileURLToPath(
	new URL("./paid-winback-sent-log.json", import.meta.url),
);
const REQUIRED_COLUMNS = [
	"email",
	"user_name",
	"org_name",
	"role",
	"plan",
	"seats",
	"billing_interval",
	"sub_status",
	"churned_on",
	"days_since_churn",
	"active_days_12mo",
	"last_seen_on",
	"still_active_last_14d",
	"suggested_track",
] as const;
const COOLING_OFF_MIN_DAYS = 14;
const DEFAULT_LIMIT = 75;
const THROTTLE_MS = 150;

type Track = "standard" | "hot_still_using";

function argValue(args: string[], name: string): string | null {
	const index = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
	if (index === -1) return null;
	const arg = args[index];
	if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
	return args[index + 1] ?? null;
}

function parseArgs() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const send = args.includes("--send");
	const testArg = args.find((a) => a === "--test" || a.startsWith("--test="));
	const testEmail = testArg
		? testArg.includes("=")
			? testArg.split("=")[1]
			: "satya@superset.sh"
		: null;
	if (!dryRun && !send && !testEmail) {
		console.error("Pass one of: --dry-run, --test[=email], --send");
		process.exit(1);
	}
	const csvPath = argValue(args, "--csv");
	if (!csvPath || !existsSync(csvPath)) {
		console.error("Pass --csv=<path> pointing at the win-back list export.");
		process.exit(1);
	}
	const from = argValue(args, "--from") ?? "satya@superset.sh";
	const changelog = argValue(args, "--changelog");
	if ((send || testEmail) && !changelog) {
		console.error(
			'Pass --changelog="<2-3 real shipped items>" — the templates refuse to send with placeholder changelog copy.',
		);
		process.exit(1);
	}
	const limitArg = argValue(args, "--limit");
	const limit = limitArg ? Number.parseInt(limitArg, 10) : DEFAULT_LIMIT;
	if (!Number.isFinite(limit) || limit <= 0) {
		console.error("--limit must be a positive integer.");
		process.exit(1);
	}
	return { dryRun, send, testEmail, csvPath, from, changelog, limit };
}

function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
		} else if (char === '"') {
			inQuotes = true;
		} else if (char === ",") {
			row.push(field);
			field = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += char;
		}
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function parseLocalDate(value: string): Date {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (match) {
		return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	}
	return new Date(value);
}

interface WinbackRow {
	email: string;
	userName: string;
	orgName: string;
	churnedOn: Date;
	suggestedTrack: string;
	stillActiveLast14d: boolean;
}

function loadRows(csvPath: string): WinbackRow[] {
	const parsed = parseCsv(readFileSync(csvPath, "utf8"));
	const header = parsed[0]?.map((h) => h.trim());
	if (!header) {
		console.error("CSV is empty.");
		process.exit(1);
	}
	const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
	if (missing.length > 0) {
		console.error(`CSV is missing expected columns: ${missing.join(", ")}`);
		process.exit(1);
	}
	const col = Object.fromEntries(header.map((h, i) => [h, i]));
	const rows: WinbackRow[] = [];
	const seen = new Set<string>();
	let duplicates = 0;
	let badChurnDate = 0;
	for (const raw of parsed.slice(1)) {
		const email = raw[col.email]?.trim().toLowerCase();
		if (!email) continue;
		if (seen.has(email)) {
			duplicates += 1;
			continue;
		}
		seen.add(email);
		const churnedOn = parseLocalDate(raw[col.churned_on]?.trim() ?? "");
		if (Number.isNaN(churnedOn.getTime())) {
			console.warn(
				`Skipping ${email}: unparseable churned_on "${raw[col.churned_on]}"`,
			);
			badChurnDate += 1;
			continue;
		}
		rows.push({
			email,
			userName: raw[col.user_name]?.trim() ?? "",
			orgName: raw[col.org_name]?.trim() ?? "",
			churnedOn,
			suggestedTrack: raw[col.suggested_track]?.trim() ?? "",
			stillActiveLast14d: ["true", "yes", "1"].includes(
				raw[col.still_active_last_14d]?.trim().toLowerCase() ?? "",
			),
		});
	}
	console.log(
		`Loaded ${rows.length} unique rows from ${csvPath} (duplicates=${duplicates} bad-churned_on=${badChurnDate}).`,
	);
	return rows;
}

function daysSinceChurn(row: WinbackRow): number {
	return Math.floor((Date.now() - row.churnedOn.getTime()) / 86_400_000);
}

function chooseTrack(row: WinbackRow): Track | null {
	if (row.suggestedTrack === "standard") return "standard";
	if (row.suggestedTrack === "hot_still_using") return "hot_still_using";
	if (row.suggestedTrack === "cooling_off") {
		if (daysSinceChurn(row) < COOLING_OFF_MIN_DAYS) return null;
		return row.stillActiveLast14d ? "hot_still_using" : "standard";
	}
	console.warn(
		`Skipping ${row.email}: unknown suggested_track "${row.suggestedTrack}"`,
	);
	return null;
}

function firstNameOf(fullName: string): string {
	return fullName.split(/\s+/)[0] || "there";
}

interface Sender {
	header: string;
	firstName: string;
}

function parseSender(from: string): Sender {
	const match = from.match(/^(.*)<([^>]+)>$/);
	if (match) {
		const displayName = match[1].trim();
		return {
			header: from,
			firstName: displayName.split(/\s+/)[0] || displayName,
		};
	}
	const localPart = from.split("@")[0];
	const firstName = localPart.charAt(0).toUpperCase() + localPart.slice(1);
	return { header: `${firstName} <${from}>`, firstName };
}

interface RenderedEmail {
	subject: string;
	body: string;
}

function renderEmail(
	row: WinbackRow,
	track: Track,
	sender: Sender,
	changelog: string,
): RenderedEmail {
	const firstName = firstNameOf(row.userName);
	const churnMonth = format(row.churnedOn, "MMMM");
	if (track === "hot_still_using") {
		return {
			subject: "you're still around :)",
			body: `Hi ${firstName} — ${sender.firstName} from Superset.

I noticed you canceled Pro back in ${churnMonth} but you've been in Superset almost daily since — which honestly is the most useful kind of feedback, I just can't tell what it means. What stopped being worth paying for?

If it was price, a missing feature, or something broken, tell me straight. And if you'd try Pro again, reply and I'll flip on a free month so you can see what's changed — ${changelog}.

— ${sender.firstName}`,
		};
	}
	const orgPossessive = row.orgName ? `${row.orgName}'s` : "your";
	return {
		subject: "quick question about Superset",
		body: `Hi ${firstName} — ${sender.firstName} here, one of the founders of Superset.

I noticed ${orgPossessive} subscription lapsed in ${churnMonth}, and since you were one of our heavier users I wanted to ask directly: what made you stop? Even a one-line reply helps more than any dashboard we look at.

A fair amount has shipped since then — ${changelog}. If any of what drove you off is on that list, I'd love for you to give it another look. Reply here and I'll put a free month on your account — no checkout flow, I'll just set it.

Either way, thanks for having been a customer.
— ${sender.firstName}`,
	};
}

type SentLog = Record<string, { sentAt: string; track: Track }>;

function loadSentLog(): SentLog {
	if (!existsSync(SENT_LOG_PATH)) return {};
	return JSON.parse(readFileSync(SENT_LOG_PATH, "utf8"));
}

function saveSentLog(log: SentLog) {
	writeFileSync(SENT_LOG_PATH, `${JSON.stringify(log, null, "\t")}\n`);
}

async function main() {
	const { dryRun, send, testEmail, csvPath, from, changelog, limit } =
		parseArgs();
	const sender = parseSender(from);
	const rows = loadRows(csvPath);
	const sentLog = loadSentLog();

	let alreadySent = 0;
	let coolingOff = 0;
	let skippedTrack = 0;
	const eligible: { row: WinbackRow; track: Track }[] = [];
	for (const row of rows) {
		if (sentLog[row.email]) {
			alreadySent += 1;
			continue;
		}
		const track = chooseTrack(row);
		if (!track) {
			if (
				row.suggestedTrack === "cooling_off" &&
				daysSinceChurn(row) < COOLING_OFF_MIN_DAYS
			) {
				coolingOff += 1;
			} else {
				skippedTrack += 1;
			}
			continue;
		}
		eligible.push({ row, track });
	}
	eligible.sort(
		(a, b) => b.row.churnedOn.getTime() - a.row.churnedOn.getTime(),
	);
	const batch = eligible.slice(0, limit);
	const deferred = eligible.length - batch.length;

	console.log(
		`Eligible: ${eligible.length} (already-sent=${alreadySent} cooling_off<${COOLING_OFF_MIN_DAYS}d=${coolingOff} skipped-track=${skippedTrack}). Batch: ${batch.length} (limit=${limit}, deferred=${deferred}).`,
	);

	if (dryRun) {
		for (const { row, track } of batch) {
			console.log(
				`→ ${row.email} track=${track} churned=${format(row.churnedOn, "yyyy-MM-dd")} (${daysSinceChurn(row)}d ago) org="${row.orgName}"`,
			);
		}
		for (const track of ["standard", "hot_still_using"] as const) {
			const sample = batch.find((e) => e.track === track);
			if (!sample) continue;
			const rendered = renderEmail(
				sample.row,
				track,
				sender,
				changelog ?? "{changelog items — pass --changelog}",
			);
			console.log(`\n--- sample ${track} (${sample.row.email}) ---`);
			console.log(`From: ${sender.header}`);
			console.log(`Subject: ${rendered.subject}\n`);
			console.log(rendered.body);
		}
		return;
	}

	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		console.error("RESEND_API_KEY env var is not set.");
		process.exit(1);
	}
	const resend = new Resend(apiKey);

	if (testEmail) {
		for (const track of ["standard", "hot_still_using"] as const) {
			const sample = batch.find((e) => e.track === track);
			if (!sample) {
				console.log(`No eligible ${track} row; skipping test send.`);
				continue;
			}
			const rendered = renderEmail(sample.row, track, sender, changelog ?? "");
			console.log(
				`Test mode: sending ${track} personalization for ${sample.row.email} to ${testEmail}`,
			);
			const { data, error } = await resend.emails.send({
				from: sender.header,
				to: testEmail,
				subject: `[TEST] ${rendered.subject}`,
				text: rendered.body,
			});
			if (error) {
				console.error("Send failed:", error);
				process.exit(1);
			}
			console.log("Sent:", data?.id);
			await new Promise((r) => setTimeout(r, THROTTLE_MS));
		}
		return;
	}

	if (send) {
		let sent = 0;
		let failed = 0;
		for (const { row, track } of batch) {
			const rendered = renderEmail(row, track, sender, changelog ?? "");
			const { error } = await resend.emails.send({
				from: sender.header,
				to: row.email,
				subject: rendered.subject,
				text: rendered.body,
			});
			if (error) {
				console.error(`✗ ${row.email}:`, error);
				failed += 1;
			} else {
				console.log(`✓ ${row.email} (${track})`);
				sentLog[row.email] = { sentAt: new Date().toISOString(), track };
				saveSentLog(sentLog);
				sent += 1;
			}
			// Resend free tier: ~10 req/s. Throttle slightly to be safe.
			await new Promise((r) => setTimeout(r, THROTTLE_MS));
		}
		console.log(
			`\nDone. sent=${sent} failed=${failed} batch=${batch.length} remaining=${deferred}`,
		);
	}
}

await main();
process.exit(0);
