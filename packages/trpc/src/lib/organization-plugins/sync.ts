import { db } from "@superset/db/client";
import {
	organizationPluginSources,
	organizationPlugins,
	type SelectOrganizationPluginSource,
} from "@superset/db/schema";
import { DEFAULT_ORGANIZATION_PLUGIN_POLICY } from "@superset/shared/plugins";
import {
	packPluginBundle,
	pluginBundleHash,
} from "@superset/shared/plugins/bundle";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { putObject } from "../r2";
import { sourceCredentials } from "./credentials";
import { type RepositorySnapshot, readAll, repositorySnapshot } from "./github";
import {
	findManifestFile,
	findMarketplaceFile,
	MARKETPLACE_FILES,
	type MarketplaceEntry,
	type MarketplaceProblem,
	parseMarketplace,
	pluginTreeFiles,
	skillsIn,
	withVersion,
} from "./marketplace";
import { organizationBundleKey, readOrganizationBundle } from "./rules";

export interface SourceSyncResult {
	sha: string | null;
	synced: string[];
	unchanged: string[];
	problems: MarketplaceProblem[];
	error: string | null;
}

async function bundleFor(
	snapshot: RepositorySnapshot,
	entry: MarketplaceEntry,
): Promise<{ bundle: Buffer; skills: ReturnType<typeof skillsIn> }> {
	const manifestPath = findManifestFile(snapshot.paths, entry.dir);
	const tree = pluginTreeFiles(snapshot.paths, entry.dir);
	const contents = await readAll(snapshot, [
		...(manifestPath ? [manifestPath] : []),
		...tree.keys(),
	]);

	const files = new Map<string, Uint8Array>();
	for (const [repoPath, bundlePath] of tree) {
		files.set(bundlePath, contents.get(repoPath) as Buffer);
	}
	let manifest: Record<string, unknown> = { ...entry.declared };
	if (manifestPath) {
		try {
			manifest = JSON.parse(
				(contents.get(manifestPath) as Buffer).toString("utf8"),
			);
		} catch {
			throw new Error(`${manifestPath} is not valid JSON`);
		}
	}
	if (manifest.name !== entry.name) {
		throw new Error(
			`its plugin.json is named "${String(manifest.name)}", not "${entry.name}"`,
		);
	}
	files.set(
		"plugin.json",
		Buffer.from(JSON.stringify(withVersion(manifest, files), null, "\t")),
	);
	return { bundle: packPluginBundle(files), skills: skillsIn(files) };
}

/**
 * Brings an organization's plugins in line with one repository source. A
 * plugin that fails keeps its last good version; one that left the
 * repository is marked, not deleted, so members keep what they installed.
 */
const CREDENTIAL_LABEL = {
	admin: "the GitHub account of the admin who added it",
	app: "the organization's GitHub App",
} as const;

async function readWithFirstCredential(
	source: SelectOrganizationPluginSource,
	readSnapshot: typeof repositorySnapshot,
): Promise<RepositorySnapshot> {
	const credentials = await sourceCredentials(source);
	if (!credentials.length) {
		throw new Error(
			"nothing can read the repository: the admin who added it has no connected GitHub account, and the organization's GitHub App is not installed",
		);
	}
	const failures: string[] = [];
	for (const credential of credentials) {
		try {
			return await readSnapshot({
				token: await credential.token(),
				repo: source.repo,
				ref: source.ref,
			});
		} catch (error) {
			failures.push(
				`${CREDENTIAL_LABEL[credential.as]}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	throw new Error(`could not read the repository with ${failures.join("; ")}`);
}

export async function syncOrganizationPluginSource(
	sourceId: string,
	readSnapshot: typeof repositorySnapshot = repositorySnapshot,
): Promise<SourceSyncResult> {
	const source = await db.query.organizationPluginSources.findFirst({
		where: eq(organizationPluginSources.id, sourceId),
	});
	if (!source) throw new Error(`no plugin source ${sourceId}`);

	const result: SourceSyncResult = {
		sha: null,
		synced: [],
		unchanged: [],
		problems: [],
		error: null,
	};

	try {
		const snapshot = await readWithFirstCredential(source, readSnapshot);
		result.sha = snapshot.sha;

		const file = findMarketplaceFile(snapshot.paths, source.path);
		if (!file) {
			throw new Error(
				`no marketplace file (${MARKETPLACE_FILES.join(", ")}) at ${source.path || "the repository root"}`,
			);
		}
		let raw: unknown;
		try {
			raw = JSON.parse((await snapshot.read(file)).toString("utf8"));
		} catch {
			throw new Error(`${file} is not valid JSON`);
		}
		const { entries, problems } = parseMarketplace(raw, source.path);
		result.problems.push(...problems);

		const existing = await db
			.select()
			.from(organizationPlugins)
			.where(eq(organizationPlugins.organizationId, source.organizationId));
		const byName = new Map(existing.map((row) => [row.name, row]));

		const seen: string[] = [];
		for (const entry of entries) {
			try {
				const current = byName.get(entry.name);
				if (current && current.sourceId !== source.id) {
					throw new Error(
						"another source of this organization already has a plugin with this name",
					);
				}
				const { bundle, skills } = await bundleFor(snapshot, entry);
				const manifest = { ...readOrganizationBundle(bundle), skills };
				const contentHash = pluginBundleHash(bundle);
				seen.push(entry.name);

				if (
					current?.contentHash === contentHash &&
					!current.removedFromSourceAt
				) {
					result.unchanged.push(entry.name);
					continue;
				}
				await putObject({
					key: organizationBundleKey(source.organizationId, contentHash),
					body: bundle,
					contentType: "application/gzip",
					bucket: "private",
				});
				await db
					.insert(organizationPlugins)
					.values({
						organizationId: source.organizationId,
						sourceId: source.id,
						name: manifest.name,
						version: manifest.version,
						manifest,
						contentHash,
						installPolicy: DEFAULT_ORGANIZATION_PLUGIN_POLICY,
					})
					.onConflictDoUpdate({
						target: [
							organizationPlugins.organizationId,
							organizationPlugins.name,
						],
						set: {
							version: manifest.version,
							manifest,
							contentHash,
							removedFromSourceAt: null,
						},
					});
				result.synced.push(entry.name);
			} catch (error) {
				if (byName.get(entry.name)?.sourceId === source.id) {
					seen.push(entry.name);
				}
				result.problems.push({
					name: entry.name,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
		}

		await db
			.update(organizationPlugins)
			.set({ removedFromSourceAt: new Date() })
			.where(
				and(
					eq(organizationPlugins.sourceId, source.id),
					isNull(organizationPlugins.removedFromSourceAt),
					seen.length ? notInArray(organizationPlugins.name, seen) : undefined,
				),
			);
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}

	const problems = result.problems.map((p) => `${p.name}: ${p.reason}`);
	await db
		.update(organizationPluginSources)
		.set({
			...(result.error ? {} : { syncedSha: result.sha, syncedAt: new Date() }),
			syncError: [result.error, ...problems].filter(Boolean).join("\n") || null,
		})
		.where(eq(organizationPluginSources.id, source.id));

	return result;
}

export async function syncAllOrganizationPluginSources(): Promise<{
	sources: number;
	failed: number;
}> {
	const sources = await db
		.select({ id: organizationPluginSources.id })
		.from(organizationPluginSources);
	let failed = 0;
	for (const source of sources) {
		const outcome = await syncOrganizationPluginSource(source.id).catch(
			(error) => {
				console.error("[organization-plugins] sync failed", source.id, error);
				return null;
			},
		);
		if (!outcome || outcome.error) failed++;
	}
	return { sources: sources.length, failed };
}
