import { parseArgs } from "node:util";
import superjson from "superjson";

import type { RouterInputs, RouterOutputs } from "../src/root";
import { parseFollowUp, pickCandidate, todayLocal } from "./hiring-args";

type Hiring = RouterOutputs["hiring"];
type ApplicationRow = Hiring["list"][number];

const HELP = `Read and write the hiring pipeline through the deployed trpc.hiring.* API.

Env: SUPERSET_API_KEY (an @superset.sh account), SUPERSET_API_URL (default https://api.superset.sh)

Commands:
  today                                   Due and overdue follow-ups
  list [--status active|closed|all] [-q text]
  get <candidate>                         Facts, roles and timeline
  note <candidate> "text" [--kind note|reply|outreach|interview] [--as label]
  touch <candidate> [--next 7d] [--note text] [--as label]
                                          We contacted them: logs outreach, sets the next follow-up
  follow-up <candidate> <when|clear>      Only set or clear the follow-up date
  add --name … --role "Founding Engineer" [--email … --github … --linkedin …
      --source power_user|referral|waas|inbound|outbound --stage … --note … --as label]

<candidate>: id, email, GitHub handle or URL, or a name that matches one person.
<when>: 7d, tomorrow, tue/tuesday (the next one), or 2026-10-20.
--as labels the event as written by an agent, e.g. --as "Hiring Check-in".
Output: tables in a terminal; compact JSON with --json or when piped (--full for raw).
Moving and closing candidates stay in admin.superset.sh/hiring.`;

const API_URL = (
	process.env.SUPERSET_API_URL ?? "https://api.superset.sh"
).replace(/\/+$/, "");
const API_KEY = process.env.SUPERSET_API_KEY;

async function call<T>(
	kind: "query" | "mutation",
	path: string,
	input?: unknown,
): Promise<T> {
	if (!API_KEY) {
		throw new Error(
			"Set SUPERSET_API_KEY (an @superset.sh account's API key).",
		);
	}
	const encoded = superjson.serialize(input);
	const url = new URL(`${API_URL}/api/trpc/hiring.${path}`);
	const init: RequestInit = {
		headers: { "x-api-key": API_KEY, "content-type": "application/json" },
	};
	if (kind === "query") {
		if (input !== undefined) {
			url.searchParams.set("input", JSON.stringify(encoded));
		}
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
	const searchable = !query.includes("@") && !query.includes("/");
	const isId = /^[0-9a-f-]{36}$/i.test(query);
	const rows = await call<Hiring["list"]>("query", "list", {
		status: "all",
		q: searchable && !isId ? query : undefined,
	} satisfies RouterInputs["hiring"]["list"]);
	return pickCandidate(query, rows);
}

function compactRow(row: ApplicationRow) {
	return {
		candidateId: row.candidateId,
		applicationId: row.applicationId,
		name: row.name,
		email: row.email,
		github: row.githubUrl,
		role: row.roleTitle,
		stage: row.stage,
		outcome: row.outcome,
		owner: row.ownerName,
		nextFollowUpOn: row.nextFollowUpOn,
		lastContactedAt: row.lastContactedAt?.toISOString().slice(0, 10) ?? null,
		nextStep: row.nextStep,
	};
}

function printTable(rows: Record<string, string | null | undefined>[]) {
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

function rowsTable(rows: ApplicationRow[]) {
	printTable(
		rows.map((row) => {
			const c = compactRow(row);
			return {
				name: c.name,
				role: c.role,
				stage: c.stage,
				outcome: c.outcome,
				owner: c.owner,
				"follow-up": c.nextFollowUpOn,
				"last contact": c.lastContactedAt,
				"next step": c.nextStep,
			};
		}),
	);
}

async function main() {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			help: { type: "boolean", short: "h" },
			json: { type: "boolean" },
			full: { type: "boolean" },
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
	if (values.help || !command || command === "help") return console.log(HELP);

	const json = values.json || values.full || !process.stdout.isTTY;
	const out = (compact: unknown, full: unknown, table: () => void) =>
		json
			? console.log(JSON.stringify(values.full ? full : compact, null, 2))
			: table();

	switch (command) {
		case "today":
		case "list": {
			const rows =
				command === "today"
					? await call<Hiring["today"]>("query", "today", {
							today: todayLocal(),
						})
					: await call<Hiring["list"]>("query", "list", {
							status: (values.status ?? "active") as
								| "active"
								| "closed"
								| "all",
							q: values.q,
						});
			return out(rows.map(compactRow), rows, () => rowsTable(rows));
		}
		case "get": {
			if (!target) throw new Error("Usage: hiring get <candidate>");
			const { candidateId } = await resolveCandidate(target);
			const detail = await call<Hiring["get"]>("query", "get", {
				candidateId,
			});
			const { candidate } = detail;
			const events = detail.events.map((event) => ({
				at: event.occurredAt.toISOString().slice(0, 19),
				kind: event.kind,
				by: event.authorLabel ?? event.authorName,
				text:
					event.body ??
					(event.metadata?.toStage
						? `${event.metadata.fromStage} → ${event.metadata.toStage}`
						: (event.metadata?.toOutcome ?? null)),
			}));
			const compact = {
				candidateId: candidate.id,
				name: candidate.name,
				email: candidate.email,
				github: candidate.githubUrl,
				linkedin: candidate.linkedinUrl,
				source: candidate.source,
				applications: detail.applications.map(compactRow),
				events,
			};
			return out(compact, detail, () => {
				console.log(
					`${candidate.name}  ${[candidate.email, candidate.githubUrl, candidate.linkedinUrl].filter(Boolean).join("  ")}`,
				);
				rowsTable(detail.applications);
				console.log("");
				printTable(events);
			});
		}
		case "note": {
			if (!target || !text) {
				throw new Error('Usage: hiring note <candidate> "text"');
			}
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
			return out(result, result, () => console.log(`Noted on ${row.name}.`));
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
				authorLabel: values.as,
			} satisfies RouterInputs["hiring"]["logTouch"]);
			return out(result, result, () =>
				console.log(`Touched ${row.name}; next follow-up ${nextFollowUpOn}.`),
			);
		}
		case "follow-up": {
			if (!target || !text) {
				throw new Error("Usage: hiring follow-up <candidate> <when|clear>");
			}
			const row = await resolveCandidate(target);
			const nextFollowUpOn =
				text === "clear" || text === "none" ? null : parseFollowUp(text);
			await call("mutation", "updateApplication", {
				applicationId: row.applicationId,
				nextFollowUpOn,
			} satisfies RouterInputs["hiring"]["updateApplication"]);
			const result = {
				name: row.name,
				applicationId: row.applicationId,
				nextFollowUpOn,
			};
			return out(result, result, () =>
				console.log(
					nextFollowUpOn
						? `${row.name}: next follow-up ${nextFollowUpOn}.`
						: `${row.name}: follow-up cleared.`,
				),
			);
		}
		case "add": {
			if (!values.name || !values.role) {
				throw new Error(
					'Usage: hiring add --name … --role "Founding Engineer"',
				);
			}
			const roles = await call<Hiring["roles"]>("query", "roles");
			const role = roles.find(
				(r) => r.title.toLowerCase() === values.role?.toLowerCase(),
			);
			if (!role) {
				throw new Error(
					`No role "${values.role}". Roles: ${roles.map((r) => r.title).join(", ")}`,
				);
			}
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
					authorLabel: values.as,
				} satisfies RouterInputs["hiring"]["createCandidate"],
			);
			return out(result, result, () =>
				console.log(`Added ${values.name} (${result.candidateId}).`),
			);
		}
		default:
			throw new Error(`Unknown command "${command}".\n\n${HELP}`);
	}
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
