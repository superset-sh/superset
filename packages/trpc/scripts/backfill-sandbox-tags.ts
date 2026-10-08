import { db } from "@superset/db/client";
import { cloudWorkspaces, environments } from "@superset/db/schema";
import { APIError, Sandbox } from "@vercel/sandbox";
import { and, eq } from "drizzle-orm";

/**
 * Writes the tags `provisionSandbox` gives a new sandbox onto the ones made
 * before it: every cloud workspace's box and every forkable golden. Lists the
 * sandboxes no row accounts for at the end.
 *
 * Reports what it would do unless `--apply` is passed. Safe to run again.
 *
 * Usage: VERCEL_SANDBOX_TOKEN=… VERCEL_SANDBOX_TEAM_ID=… VERCEL_SANDBOX_PROJECT_ID=… \
 *   bun run packages/trpc/scripts/backfill-sandbox-tags.ts [--apply]
 */

const apply = process.argv.includes("--apply");

const token = process.env.VERCEL_SANDBOX_TOKEN;
const teamId = process.env.VERCEL_SANDBOX_TEAM_ID;
const projectId = process.env.VERCEL_SANDBOX_PROJECT_ID;
if (!token || !teamId || !projectId) {
	console.error(
		"VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID and VERCEL_SANDBOX_PROJECT_ID are required",
	);
	process.exit(64);
}
const credentials = { token, teamId, projectId };

interface Target {
	name: string;
	tags: Record<string, string>;
}

const workspaceRows = await db
	.select({
		id: cloudWorkspaces.id,
		organizationId: cloudWorkspaces.organizationId,
		createdByUserId: cloudWorkspaces.createdByUserId,
		providerSandboxId: cloudWorkspaces.providerSandboxId,
	})
	.from(cloudWorkspaces)
	.where(eq(cloudWorkspaces.provider, "vercel"));
const environmentRows = await db
	.select({
		organizationId: environments.organizationId,
		sourceRef: environments.sourceRef,
	})
	.from(environments)
	.where(
		and(
			eq(environments.provider, "vercel"),
			eq(environments.sourceKind, "fork"),
		),
	);

const targets: Target[] = [
	...workspaceRows.map((row) => ({
		name: row.providerSandboxId,
		tags: {
			kind: "workspace",
			org: row.organizationId,
			workspace: row.id,
			...(row.createdByUserId ? { user: row.createdByUserId } : {}),
		},
	})),
	...environmentRows.map((row) => ({
		name: row.sourceRef,
		tags: { kind: "environment", org: row.organizationId },
	})),
];

const sameTags = (a: Record<string, string>, b: Record<string, string>) =>
	JSON.stringify(Object.entries(a).sort()) ===
	JSON.stringify(Object.entries(b).sort());

const counts = { tagged: 0, alreadyTagged: 0, gone: 0 };
for (const target of targets) {
	let sandbox: Sandbox;
	try {
		sandbox = await Sandbox.get({
			...credentials,
			name: target.name,
			resume: false,
		});
	} catch (error) {
		if (error instanceof APIError && error.response.status === 404) {
			counts.gone++;
			continue;
		}
		throw error;
	}
	const { tags } = target;
	if (sameTags(sandbox.tags ?? {}, tags)) {
		counts.alreadyTagged++;
		continue;
	}
	console.log(
		`${target.name} (${sandbox.status}): ${JSON.stringify(sandbox.tags ?? {})} -> ${JSON.stringify(tags)}`,
	);
	if (apply) await sandbox.update({ tags });
	counts.tagged++;
}

const known = new Set(targets.map((target) => target.name));
const unaccounted: string[] = [];
for await (const sandbox of await Sandbox.list({ ...credentials, limit: 50 })) {
	if (!known.has(sandbox.name)) {
		unaccounted.push(`${sandbox.name} ${JSON.stringify(sandbox.tags ?? {})}`);
	}
}

console.log(
	`${apply ? "tagged" : "to tag"}: ${counts.tagged}, already tagged: ${counts.alreadyTagged}, row without a sandbox: ${counts.gone}`,
);
console.log(`sandboxes no row accounts for: ${unaccounted.length}`);
for (const line of unaccounted) console.log(`  ${line}`);
