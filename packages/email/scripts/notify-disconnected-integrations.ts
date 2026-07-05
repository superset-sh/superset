#!/usr/bin/env bun
// One-shot notifier for the integration-connections dup-linkage migration.
// Sends a per-user email summarizing which Linear/Slack workspaces were
// disconnected from their Superset org because another org won the linkage.
//
// Run with NEXT_PUBLIC_MARKETING_URL forced to prod so logos/social icons
// resolve when the recipient opens the email (local .env points at
// localhost which is fine for dev preview but useless in a real inbox).
//
// Usage:
//   NEXT_PUBLIC_MARKETING_URL=https://superset.sh bun run scripts/notify-disconnected-integrations.ts --dry-run
//   NEXT_PUBLIC_MARKETING_URL=https://superset.sh bun run scripts/notify-disconnected-integrations.ts --test=satya@superset.sh
//   NEXT_PUBLIC_MARKETING_URL=https://superset.sh bun run scripts/notify-disconnected-integrations.ts --send

if (process.env.NEXT_PUBLIC_MARKETING_URL !== "https://superset.sh") {
	console.error(
		"Set NEXT_PUBLIC_MARKETING_URL=https://superset.sh before running so logos/socials in the email resolve.",
	);
	process.exit(1);
}

import { db } from "@superset/db/client";
import {
	users as authUsers,
	integrationConnections,
	organizations,
} from "@superset/db/schema";
import {
	type DisconnectedConnection,
	IntegrationDisconnectedEmail,
} from "@superset/email/emails/integration-disconnected";
import { aliasedTable, and, eq, isNull } from "drizzle-orm";
import { Resend } from "resend";

const FROM = "Superset <noreply@superset.sh>";
const REPLY_TO = "founders@superset.sh";

function parseArgs() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const send = args.includes("--send");
	const testArg = args.find((a) => a.startsWith("--test"));
	const testEmail = testArg
		? testArg.includes("=")
			? testArg.split("=")[1]
			: "satya@superset.sh"
		: null;
	if (!dryRun && !send && !testEmail) {
		console.error("Pass one of: --dry-run, --test[=email], --send");
		process.exit(1);
	}
	return { dryRun, send, testEmail };
}

interface AffectedRow {
	recipientEmail: string;
	recipientName: string | null;
	connection: DisconnectedConnection;
}

async function loadAffected(): Promise<AffectedRow[]> {
	const winnerIc = aliasedTable(integrationConnections, "winner_ic");
	const winnerUser = aliasedTable(authUsers, "winner_user");

	const rows = await db
		.select({
			recipientEmail: authUsers.email,
			recipientName: authUsers.name,
			orgName: organizations.name,
			workspaceName: integrationConnections.externalOrgName,
			provider: integrationConnections.provider,
			winnerEmail: winnerUser.email,
		})
		.from(integrationConnections)
		.innerJoin(
			authUsers,
			eq(authUsers.id, integrationConnections.connectedByUserId),
		)
		.innerJoin(
			organizations,
			eq(organizations.id, integrationConnections.organizationId),
		)
		.innerJoin(
			winnerIc,
			and(
				eq(winnerIc.provider, integrationConnections.provider),
				eq(winnerIc.externalOrgId, integrationConnections.externalOrgId),
				isNull(winnerIc.disconnectedAt),
			),
		)
		.innerJoin(winnerUser, eq(winnerUser.id, winnerIc.connectedByUserId))
		.where(eq(integrationConnections.disconnectReason, "duplicate_resolved"));

	return rows.map((r) => ({
		recipientEmail: r.recipientEmail,
		recipientName: r.recipientName,
		connection: {
			orgName: r.orgName,
			workspaceName: r.workspaceName ?? "(unnamed workspace)",
			provider: r.provider === "linear" ? "Linear" : "Slack",
			winnerEmail: r.winnerEmail,
		},
	}));
}

function groupByRecipient(rows: AffectedRow[]) {
	const grouped = new Map<
		string,
		{ name: string | null; connections: DisconnectedConnection[] }
	>();
	for (const row of rows) {
		const existing = grouped.get(row.recipientEmail);
		if (existing) {
			existing.connections.push(row.connection);
		} else {
			grouped.set(row.recipientEmail, {
				name: row.recipientName,
				connections: [row.connection],
			});
		}
	}
	return grouped;
}

async function main() {
	const { dryRun, send, testEmail } = parseArgs();
	const rows = await loadAffected();
	const grouped = groupByRecipient(rows);

	console.log(
		`Loaded ${rows.length} affected rows across ${grouped.size} unique users.`,
	);

	if (dryRun) {
		for (const [email, { name, connections }] of grouped) {
			console.log(
				`→ ${email} (${name ?? "no name"}) — ${connections.length} connection(s):`,
			);
			for (const c of connections) {
				console.log(
					`    • ${c.orgName} → ${c.provider} "${c.workspaceName}" (owner: ${c.winnerEmail})`,
				);
			}
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
		// Pick the user with the most disconnected connections so the test
		// renders the bullet list with multiple items.
		const top = [...grouped.entries()].sort(
			(a, b) => b[1].connections.length - a[1].connections.length,
		)[0];
		if (!top) {
			console.log("No affected rows; nothing to send.");
			return;
		}
		const [originalEmail, { name, connections }] = top;
		console.log(
			`Test mode: sending personalization for ${originalEmail} (${connections.length} connection(s)) to ${testEmail}`,
		);
		const { data, error } = await resend.emails.send({
			from: FROM,
			to: testEmail,
			replyTo: REPLY_TO,
			subject: `[TEST] Your Superset integration was disconnected`,
			react: IntegrationDisconnectedEmail({
				recipientName: name,
				connections,
			}),
		});
		if (error) {
			console.error("Send failed:", error);
			process.exit(1);
		}
		console.log("Sent:", data?.id);
		return;
	}

	if (send) {
		let sent = 0;
		let failed = 0;
		for (const [email, { name, connections }] of grouped) {
			const { error } = await resend.emails.send({
				from: FROM,
				to: email,
				replyTo: REPLY_TO,
				subject: "Your Superset integration was disconnected",
				react: IntegrationDisconnectedEmail({
					recipientName: name,
					connections,
				}),
			});
			if (error) {
				console.error(`✗ ${email}:`, error);
				failed += 1;
			} else {
				console.log(`✓ ${email} (${connections.length} connection(s))`);
				sent += 1;
			}
			// Resend free tier: ~10 req/s. Throttle slightly to be safe.
			await new Promise((r) => setTimeout(r, 150));
		}
		console.log(`\nDone. sent=${sent} failed=${failed} total=${grouped.size}`);
	}
}

await main();
process.exit(0);
