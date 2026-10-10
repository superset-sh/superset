import { parseArgs } from "node:util";
import superjson from "superjson";

import type { RouterInputs, RouterOutputs } from "../src/root";
import { parseFollowUp, pickCandidate, todayLocal } from "./hiring-args";

/**
 * Read and write the hiring pipeline from a terminal or an agent, through the
 * deployed `trpc.hiring.*` API (same checks and timeline events as /hiring).
 *
 * Needs SUPERSET_API_KEY from an @superset.sh account. SUPERSET_API_URL
 * defaults to https://api.superset.sh. Output is JSON with --json or when
 * stdout is not a terminal.
 *
 *   bun hiring today
 *   bun hiring list [--status active|closed|all] [-q text]
 *   bun hiring get <candidate>
 *   bun hiring note <candidate> "text" [--kind note|reply|outreach|interview] [--as "Hiring Check-in"]
 *   bun hiring touch <candidate> [--next 7d|2026-10-20] [--note text]
 *   bun hiring add --name … --role "Founding Engineer" [--email … --github … --linkedin … --source … --note …]
 *
 * <candidate> is an id, an email, a GitHub handle, or a name that matches one person.
 * Moving and closing candidates stay in the admin page.
 */

type Hiring = RouterOutputs["hiring"];
type ApplicationRow = Hiring["list"][number];

const API_URL = (
	process.env.SUPERSET_API_URL ?? "https://api.superset.sh"
).replace(/\/+$/, "");
const API_KEY = process.env.SUPERSET_API_KEY;

async function call<T>(
	kind: "query" | "mutation",
	path: string,
	input?: unknown,
): Promise<T> {
	if (!API_KEY)
		throw new Error(
			"Set SUPERSET_API_KEY (an @superset.sh account's API key).",
		);
	const encoded = superjson.serialize(input);
	const url = new URL(`${API_URL}/api/trpc/hiring.${path}`);
	const init: RequestInit = {
		headers: { "x-api-key": API_KEY, "content-type": "application/json" },
	};
	if (kind === "query") {
		if (input !== undefined)
			url.searchParams.set("input", JSON.stringify(encoded));
	} else {
		init.method = "POST";
		init.body = JSON.stringify(encoded);
	}
	const response = await fetch(url, init);
	const body = (await response.json().catch(() => null)) as {
		result?: { data: Parameters<typeof superjson.deserialize>[0] };
		error?: { json?: { message?: string } };
	} | null;
	if (!response.ok || !body?.result) {
		throw new Error(
			`hiring.${path} failed (${response.status}): ${body?.error?.json?.message ?? response.statusText}`,
		);
	}
	return superjson.deserialize<T>(body.result.data);
}

async function resolveCandidate(query: string): Promise<ApplicationRow> {
	const rows = await call<Hiring["list"]>("query", "list", {
		status: "all",
		q:
			query.includes("@") || /^[0-9a-f-]{36}$/i.test(query) ? undefined : query,
	} satisfies RouterInputs["hiring"]["list"]);
	return pickCandidate(query, rows);
}

function printTable(rows: Record<string, string>[]) {
	if (rows.length === 0) return console.log("(none)");
	const keys = Object.keys(rows[0] ?? {});
	const widths = keys.map((key) =>
		Math.min(
			48,
			Math.max(key.length, ...rows.map((row) => (row[key] ?? "").length)),
		),
	);
	const line = (cells: string[]) =>
		cells
			.map((cell, i) => cell.slice(0, widths[i]).padEnd(widths[i] ?? 0))
			.join("  ");
	console.log(line(keys));
	for (const row of rows) console.log(line(keys.map((key) => row[key] ?? "")));
}

function applicationRows(rows: ApplicationRow[]) {
	return rows.map((row) => ({
		name: row.name,
		role: row.roleTitle,
		stage: row.stage,
		outcome: row.outcome,
		owner: row.ownerName ?? "",
		"follow-up": row.nextFollowUpOn ?? "",
		"next step": row.nextStep ?? "",
	}));
}

async function main() {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			json: { type: "boolean" },
			status: { type: "string" },
			q: { type: "string", short: "q" },
			kind: { type: "string" },
			as: { type: "string" },
			next: { type: "string" },
			note: { type: "string" },
			name: { type: "string" },
			role: { type: "string" },
			email: { type: "string" },
			github: { type: "string" },
			linkedin: { type: "string" },
			source: { type: "string" },
			stage: { type: "string" },
		},
	});
	const [command, target, text] = positionals;
	const json = values.json || !process.stdout.isTTY;
	const out = (data: unknown, table: () => void) =>
		json ? console.log(JSON.stringify(data, null, 2)) : table();

	switch (command) {
		case "today": {
			const rows = await call<Hiring["today"]>("query", "today", {
				today: todayLocal(),
			});
			return out(rows, () => printTable(applicationRows(rows)));
		}
		case "list": {
			const rows = await call<Hiring["list"]>("query", "list", {
				status: (values.status ?? "active") as "active" | "closed" | "all",
				q: values.q,
			});
			return out(rows, () => printTable(applicationRows(rows)));
		}
		case "get": {
			if (!target) throw new Error("Usage: hiring get <candidate>");
			const { candidateId } = await resolveCandidate(target);
			const detail = await call<Hiring["get"]>("query", "get", { candidateId });
			return out(detail, () => {
				const { candidate } = detail;
				console.log(
					`${candidate.name}  ${[candidate.email, candidate.githubUrl, candidate.linkedinUrl].filter(Boolean).join("  ")}`,
				);
				printTable(applicationRows(detail.applications));
				console.log("");
				for (const event of detail.events) {
					const who = event.authorName ?? event.authorLabel ?? "";
					console.log(
						`${event.occurredAt.toISOString().slice(0, 16)}  ${event.kind}  ${who}  ${event.body ?? JSON.stringify(event.metadata ?? {})}`,
					);
				}
			});
		}
		case "note": {
			if (!target || !text)
				throw new Error('Usage: hiring note <candidate> "text"');
			const row = await resolveCandidate(target);
			const result = await call("mutation", "addEvent", {
				candidateId: row.candidateId,
				applicationId: row.applicationId,
				kind: (values.kind ?? "note") as
					| "note"
					| "reply"
					| "outreach"
					| "interview",
				body: text,
				authorLabel: values.as,
			} satisfies RouterInputs["hiring"]["addEvent"]);
			return out(result, () => console.log(`Noted on ${row.name}.`));
		}
		case "touch": {
			if (!target)
				throw new Error("Usage: hiring touch <candidate> [--next 7d]");
			const row = await resolveCandidate(target);
			const nextFollowUpOn = parseFollowUp(values.next ?? "7d");
			const result = await call("mutation", "logTouch", {
				applicationId: row.applicationId,
				nextFollowUpOn,
				note: values.note,
			} satisfies RouterInputs["hiring"]["logTouch"]);
			return out(result, () =>
				console.log(`Touched ${row.name}; next follow-up ${nextFollowUpOn}.`),
			);
		}
		case "add": {
			if (!values.name || !values.role)
				throw new Error(
					'Usage: hiring add --name … --role "Founding Engineer"',
				);
			const roles = await call<Hiring["roles"]>("query", "roles");
			const role = roles.find(
				(r) => r.title.toLowerCase() === values.role?.toLowerCase(),
			);
			if (!role)
				throw new Error(
					`No role "${values.role}". Roles: ${roles.map((r) => r.title).join(", ")}`,
				);
			const result = await call<Hiring["createCandidate"]>(
				"mutation",
				"createCandidate",
				{
					name: values.name,
					roleId: role.id,
					email: values.email,
					githubUrl: values.github,
					linkedinUrl: values.linkedin,
					source:
						values.source as RouterInputs["hiring"]["createCandidate"]["source"],
					stage: (values.stage ??
						"sourced") as RouterInputs["hiring"]["createCandidate"]["stage"],
					note: values.note,
				} satisfies RouterInputs["hiring"]["createCandidate"],
			);
			return out(result, () =>
				console.log(`Added ${values.name} (${result.candidateId}).`),
			);
		}
		default:
			throw new Error(
				"Commands: today, list, get, note, touch, add. See the header of packages/trpc/scripts/hiring.ts.",
			);
	}
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
