import { db } from "@superset/db/client";
import {
	connections,
	integrationConnections,
	userIdentities,
} from "@superset/db/schema";
import { inArray } from "drizzle-orm";
import {
	type ExternalUserSource,
	type LegacyIdentity,
	legacyConnectionRow,
} from "../src/lib/connectors/legacy";
import { secretsKeyConfigured } from "../src/lib/secret-box";
import { decryptSecret, encryptSecret } from "../src/router/plugins/crypto";

/**
 * Copies `integration_connections` into `connections`, the table every
 * integration has read from since #7317. That change shipped without moving the
 * existing rows, so each connection made before it reads as disconnected.
 *
 * Reports what it would do unless `--apply` is passed. Safe to run again: a row
 * already copied is skipped by id, and one whose owner has reconnected since is
 * left alone so the lookup never finds two live rows.
 *
 * Tokens are sealed with SECRETS_ENCRYPTION_KEY, which must be the key the API
 * decrypts with. Run it where that key lives (the Backfill Connections
 * workflow), not from a laptop.
 *
 * Usage: bun run packages/trpc/scripts/backfill-connections.ts [--apply]
 */

const BATCH_SIZE = 100;

type Outcome = "copy" | "already-copied" | "reconnected";

function liveKey(row: {
	organizationId: string;
	connector: string;
	ownerKind: string;
	connectedByUserId: string;
}): string {
	return row.ownerKind === "org"
		? `${row.organizationId}:${row.connector}`
		: `${row.organizationId}:${row.connector}:${row.connectedByUserId}`;
}

async function main() {
	const apply = process.argv.includes("--apply");

	if (!secretsKeyConfigured())
		throw new Error(
			"SECRETS_ENCRYPTION_KEY is not set. Tokens sealed without the API's key cannot be read by it.",
		);
	if ((await decryptSecret(await encryptSecret("probe"))) !== "probe")
		throw new Error("The encryption key does not round-trip.");

	const legacyRows = await db.select().from(integrationConnections);
	const existing = await db
		.select({
			id: connections.id,
			organizationId: connections.organizationId,
			connector: connections.connector,
			ownerKind: connections.ownerKind,
			connectedByUserId: connections.connectedByUserId,
			disconnectedAt: connections.disconnectedAt,
		})
		.from(connections);
	const identityRows = await db
		.select()
		.from(userIdentities)
		.where(
			inArray(userIdentities.provider, [
				...new Set(legacyRows.map((row) => row.provider as string)),
			]),
		);

	const copiedIds = new Set(existing.map((row) => row.id));
	const liveKeys = new Set(
		existing.filter((row) => !row.disconnectedAt).map(liveKey),
	);
	const identitiesByOwner = new Map<string, LegacyIdentity[]>();
	for (const identity of identityRows) {
		const key = `${identity.organizationId}:${identity.provider}:${identity.userId}`;
		const list = identitiesByOwner.get(key) ?? [];
		list.push(identity);
		identitiesByOwner.set(key, list);
	}

	const outcomes = new Map<string, Record<Outcome, number>>();
	const sources = new Map<string, Record<ExternalUserSource, number>>();
	const toInsert: Awaited<ReturnType<typeof legacyConnectionRow>>["row"][] = [];
	const plaintextById = new Map<string, string>();

	for (const legacy of legacyRows) {
		const { row, externalUserSource } = await legacyConnectionRow(
			legacy,
			identitiesByOwner.get(
				`${legacy.organizationId}:${legacy.provider}:${legacy.connectedByUserId}`,
			) ?? [],
			encryptSecret,
		);

		const outcome: Outcome = copiedIds.has(legacy.id)
			? "already-copied"
			: !row.disconnectedAt && liveKeys.has(liveKey(row))
				? "reconnected"
				: "copy";

		const tally = outcomes.get(legacy.provider) ?? {
			copy: 0,
			"already-copied": 0,
			reconnected: 0,
		};
		tally[outcome] += 1;
		outcomes.set(legacy.provider, tally);

		if (outcome !== "copy") continue;
		toInsert.push(row);
		plaintextById.set(legacy.id, legacy.accessToken);
		if (!row.disconnectedAt) liveKeys.add(liveKey(row));

		const source = sources.get(legacy.provider) ?? {
			identity: 0,
			"superset-user": 0,
			"not-required": 0,
		};
		source[externalUserSource] += 1;
		sources.set(legacy.provider, source);
	}

	console.log(apply ? "Applying.\n" : "Dry run. Pass --apply to write.\n");
	for (const [provider, tally] of outcomes) {
		const source = sources.get(provider);
		console.log(
			`${provider}: ${tally.copy} to copy, ${tally["already-copied"]} already copied, ${tally.reconnected} reconnected since` +
				(source
					? ` | external user id from identity ${source.identity}, from Superset user ${source["superset-user"]}, not required ${source["not-required"]}`
					: ""),
		);
	}

	if (!apply) return;

	let inserted = 0;
	for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
		const written = await db
			.insert(connections)
			.values(toInsert.slice(i, i + BATCH_SIZE))
			.onConflictDoNothing()
			.returning({ id: connections.id });
		inserted += written.length;
	}

	let unreadable = 0;
	const ids = [...plaintextById.keys()];
	for (let i = 0; i < ids.length; i += BATCH_SIZE) {
		const written = await db
			.select({ id: connections.id, accessToken: connections.accessToken })
			.from(connections)
			.where(inArray(connections.id, ids.slice(i, i + BATCH_SIZE)));
		for (const row of written) {
			const opened = await decryptSecret(row.accessToken).catch(() => null);
			if (opened !== plaintextById.get(row.id)) unreadable += 1;
		}
	}

	console.log(
		`\n${inserted} of ${toInsert.length} rows written, ${toInsert.length - inserted} skipped on conflict, ${unreadable} whose token does not read back.`,
	);
	if (unreadable > 0 || inserted !== toInsert.length) process.exitCode = 1;
}

await main();
