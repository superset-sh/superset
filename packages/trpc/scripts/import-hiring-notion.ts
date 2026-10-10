import { readFileSync } from "node:fs";
import { db } from "@superset/db/client";
import type {
	HiringOutcome,
	HiringScore,
	HiringSource,
	HiringStage,
} from "@superset/db/enums";
import {
	hiringApplications,
	hiringCandidates,
	hiringRoles,
	users,
} from "@superset/db/schema";
import { inArray, sql } from "drizzle-orm";

/**
 * Imports the Notion Hiring CRM into the hiring_* tables.
 *
 * Input is the JSON array produced by this query through the Notion MCP
 * (`collection://36ab9d5b-f616-81c5-b8db-000b62e41563`), concatenated across
 * pages:
 *
 *   SELECT json_group_array(json_object('url',url,'created',createdTime,
 *     'name',"Name",'email',"Email",'phone',"Phone",'title',"Title",
 *     'company',"Company",'github',"GitHub",'linkedin',"LinkedIn",'x',"X",
 *     'site',"Personal Site",'waas',"Work at a Startup",'userId',"User ID",
 *     'source',"Source",'role',"Role",'stage',"Stage",'outcome',"Outcome",
 *     'score',"Score",'owner',"Owner",'nextStep',"Next Step",
 *     'followUp',"date:Next Follow-up:start",
 *     'lastContacted',"date:Last Contacted:start",
 *     'closedAt',"date:Closed At:start"))
 *   FROM (SELECT * FROM "collection://…" ORDER BY createdTime LIMIT 40 OFFSET n)
 *
 * The file holds candidate PII: keep it out of the repo.
 *
 * Reports what it would do unless `--apply` is passed. Safe to run again:
 * candidates upsert on notion_page_id, applications on (candidate, role).
 *
 * Usage: bun run packages/trpc/scripts/import-hiring-notion.ts <file.json> [--apply]
 */

interface NotionRow {
	url: string;
	created: string;
	name: string | null;
	email: string | null;
	phone: string | null;
	title: string | null;
	company: string | null;
	github: string | null;
	linkedin: string | null;
	x: string | null;
	site: string | null;
	waas: string | null;
	userId: string | null;
	source: string | null;
	role: string | null;
	stage: string | null;
	outcome: string | null;
	score: string | null;
	owner: string | null;
	nextStep: string | null;
	followUp: string | null;
	lastContacted: string | null;
	closedAt: string | null;
}

/** Notion person ids of the two owners, mapped to their Superset emails. */
const NOTION_OWNER_EMAILS: Record<string, string> = {
	"2c9d872b-594c-818f-a379-00027f20f59f": "satya@superset.sh",
	"2c9d872b-594c-8192-a356-000262408ed3": "kiet@superset.sh",
};

const SOURCES: Record<string, HiringSource> = {
	"Power User": "power_user",
	Referral: "referral",
	"Work at a Startup": "waas",
	Inbound: "inbound",
	Outbound: "outbound",
};

const STAGES: Record<string, HiringStage> = {
	"Reached Out": "reached_out",
	"Screening Call": "screen",
	"Technical Interview": "technical",
	"System Design": "system_design",
	"Work Trial": "work_trial",
	Onsite: "onsite",
	Offer: "offer",
	Hired: "offer",
};

const OUTCOMES: Record<string, HiringOutcome> = {
	Active: "active",
	Hired: "hired",
	Rejected: "rejected",
	Withdrew: "withdrew",
	"Not Looking": "not_looking",
};

const SCORES: Record<string, HiringScore> = {
	"Strong Hire": "strong_hire",
	"Lean Hire": "lean_hire",
	"Lean No Hire": "lean_no_hire",
	"Strong No Hire": "strong_no_hire",
};

const OUTCOME_ONLY_STAGES = new Set(["Rejected", "Withdrew", "Not Looking"]);

function notionPageId(url: string): string {
	const hex = url.replace(/[^0-9a-f]/gi, "").slice(-32);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Notion kept end states in Stage. Those rows lost the stage they reached; anyone we closed was at least contacted. */
function mapStage(row: NotionRow): HiringStage {
	if (row.stage && STAGES[row.stage]) return STAGES[row.stage] as HiringStage;
	if (row.stage && OUTCOME_ONLY_STAGES.has(row.stage)) return "reached_out";
	return row.lastContacted ? "reached_out" : "sourced";
}

function mapOutcome(row: NotionRow): HiringOutcome {
	if (row.outcome && OUTCOMES[row.outcome]) {
		return OUTCOMES[row.outcome] as HiringOutcome;
	}
	if (row.stage && OUTCOMES[row.stage])
		return OUTCOMES[row.stage] as HiringOutcome;
	return "active";
}

function toDate(value: string | null): Date | null {
	return value ? new Date(value.replace(" ", "T")) : null;
}

function ownerEmail(owner: string | null): string | null {
	if (!owner) return null;
	const ids = JSON.parse(owner) as string[];
	const first = ids[0]?.replace("user://", "");
	return first ? (NOTION_OWNER_EMAILS[first] ?? null) : null;
}

async function main() {
	const [file, ...flags] = process.argv.slice(2);
	if (!file) {
		throw new Error("Usage: import-hiring-notion.ts <file.json> [--apply]");
	}
	const apply = flags.includes("--apply");
	const rows = JSON.parse(readFileSync(file, "utf8")) as NotionRow[];

	const emails = Object.values(NOTION_OWNER_EMAILS);
	const ownerRows = await db
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(inArray(users.email, emails));
	const ownerIdByEmail = new Map(ownerRows.map((u) => [u.email, u.id]));

	const linkedUserIds = rows.flatMap((row) => (row.userId ? [row.userId] : []));
	const existingUsers = linkedUserIds.length
		? await db
				.select({ id: users.id })
				.from(users)
				.where(inArray(users.id, linkedUserIds))
		: [];
	const existingUserIds = new Set(existingUsers.map((u) => u.id));

	const seenEmails = new Set<string>();
	const tally = new Map<string, number>();
	const skipped: string[] = [];
	const roleIds = new Map<string, string>();

	for (const row of rows) {
		const name = row.name?.trim();
		if (!name) {
			skipped.push(`${row.url}: no name`);
			continue;
		}
		const email = row.email?.trim().toLowerCase() || null;
		if (email && seenEmails.has(email)) {
			skipped.push(`${name}: duplicate email ${email}`);
			continue;
		}
		if (email) seenEmails.add(email);

		const stage = mapStage(row);
		const outcome = mapOutcome(row);
		const roleTitle = row.role ?? "Founding Engineer";
		const key = `${roleTitle} · ${stage} · ${outcome}`;
		tally.set(key, (tally.get(key) ?? 0) + 1);
		if (!apply) continue;

		let roleId = roleIds.get(roleTitle);
		if (!roleId) {
			await db
				.insert(hiringRoles)
				.values({ title: roleTitle })
				.onConflictDoNothing();
			const [role] = await db
				.select({ id: hiringRoles.id })
				.from(hiringRoles)
				.where(sql`${hiringRoles.title} = ${roleTitle}`);
			if (!role) throw new Error(`Role ${roleTitle} missing after insert`);
			roleId = role.id;
			roleIds.set(roleTitle, roleId);
		}

		const createdAt = toDate(row.created) ?? new Date();
		const candidateFields = {
			name,
			email,
			phone: row.phone,
			currentTitle: row.title,
			currentCompany: row.company,
			githubUrl: row.github,
			linkedinUrl: row.linkedin,
			xUrl: row.x,
			siteUrl: row.site,
			waasUrl: row.waas,
			supersetUserId:
				row.userId && existingUserIds.has(row.userId) ? row.userId : null,
			source: row.source ? (SOURCES[row.source] ?? null) : null,
		};
		const [candidate] = await db
			.insert(hiringCandidates)
			.values({
				...candidateFields,
				notionPageId: notionPageId(row.url),
				createdAt,
			})
			.onConflictDoUpdate({
				target: hiringCandidates.notionPageId,
				set: candidateFields,
			})
			.returning({ id: hiringCandidates.id });
		if (!candidate) throw new Error(`Candidate ${name} not written`);

		const closedAt = outcome === "active" ? null : toDate(row.closedAt);
		const lastContactedAt = toDate(row.lastContacted);
		const owner = ownerEmail(row.owner);
		const applicationFields = {
			stage,
			outcome,
			score: row.score ? (SCORES[row.score] ?? null) : null,
			ownerUserId: owner ? (ownerIdByEmail.get(owner) ?? null) : null,
			nextStep: row.nextStep,
			nextFollowUpOn: row.followUp?.slice(0, 10) ?? null,
			lastContactedAt,
			stageChangedAt: closedAt ?? lastContactedAt ?? createdAt,
			closedAt,
		};
		await db
			.insert(hiringApplications)
			.values({
				candidateId: candidate.id,
				roleId,
				createdAt,
				...applicationFields,
			})
			.onConflictDoUpdate({
				target: [hiringApplications.candidateId, hiringApplications.roleId],
				set: applicationFields,
			});
	}

	console.log(
		`${apply ? "Imported" : "Would import"} ${rows.length - skipped.length} of ${rows.length} rows`,
	);
	for (const [key, count] of [...tally].sort())
		console.log(`  ${count}\t${key}`);
	for (const line of skipped) console.log(`  skipped: ${line}`);
	console.log(
		`Owners found: ${[...ownerIdByEmail.keys()].join(", ") || "none"}`,
	);
	if (!apply) console.log("Dry run. Pass --apply to write.");
}

await main();
process.exit(0);
