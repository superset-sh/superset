import { db } from "@superset/db/client";
import { organizationPlugins, pluginInstalls } from "@superset/db/schema";
import { and, asc, countDistinct, eq, isNotNull } from "drizzle-orm";
import { installConnector, type PluginManifest } from "./manifest";

export interface InstalledPlugin {
	id: string;
	manifest: PluginManifest;
	marketplace: string;
	connector: string | undefined;
	organizationId?: string;
}

interface InstallRow {
	id: string;
	manifest: unknown;
	marketplace: string;
	organizationPluginId: string | null;
}

/**
 * The manifest an install runs with. An organization plugin is read from the
 * organization's row every time: the copy on the install is whatever was
 * current when the member installed it, and an admin may have changed or
 * unpublished the plugin since.
 */
async function resolveInstall(
	row: InstallRow,
	pluginName: string,
): Promise<InstalledPlugin | null> {
	if (!row.organizationPluginId) {
		return {
			id: row.id,
			manifest: row.manifest as PluginManifest,
			marketplace: row.marketplace,
			connector: installConnector({ ...row, pluginName }),
		};
	}

	const [published] = await db
		.select({
			manifest: organizationPlugins.manifest,
			organizationId: organizationPlugins.organizationId,
		})
		.from(organizationPlugins)
		.where(
			and(
				eq(organizationPlugins.id, row.organizationPluginId),
				isNotNull(organizationPlugins.publishedAt),
			),
		)
		.limit(1);
	if (!published) return null;

	return {
		id: row.id,
		manifest: published.manifest as PluginManifest,
		marketplace: row.marketplace,
		connector: installConnector({
			marketplace: row.marketplace,
			pluginName,
			manifest: published.manifest,
		}),
		organizationId: published.organizationId,
	};
}

export class AmbiguousPluginError extends Error {
	constructor(
		readonly pluginName: string,
		readonly marketplaces: string[],
	) {
		super(
			`"${pluginName}" is installed from more than one marketplace (${marketplaces.join(", ")}). Name one with plugin@marketplace.`,
		);
	}
}

export async function installedPlugin(
	userId: string,
	pluginName: string,
	marketplace?: string,
): Promise<InstalledPlugin | null> {
	const rows = await db
		.select({
			id: pluginInstalls.id,
			manifest: pluginInstalls.manifest,
			marketplace: pluginInstalls.marketplace,
			organizationPluginId: pluginInstalls.organizationPluginId,
		})
		.from(pluginInstalls)
		.where(
			and(
				eq(pluginInstalls.userId, userId),
				eq(pluginInstalls.pluginName, pluginName),
				eq(pluginInstalls.enabled, true),
				marketplace ? eq(pluginInstalls.marketplace, marketplace) : undefined,
			),
		)
		.orderBy(asc(pluginInstalls.marketplace))
		.limit(2);

	if (rows.length > 1) {
		throw new AmbiguousPluginError(
			pluginName,
			rows.map((entry) => entry.marketplace),
		);
	}

	const row = rows[0];
	if (!row) return null;
	return resolveInstall(row, pluginName);
}

export async function installRecord(
	userId: string,
	pluginName: string,
	marketplace?: string,
): Promise<{ id: string; marketplace: string; siblings: number } | null> {
	const rows = await db
		.select({
			id: pluginInstalls.id,
			marketplace: pluginInstalls.marketplace,
		})
		.from(pluginInstalls)
		.where(
			and(
				eq(pluginInstalls.userId, userId),
				eq(pluginInstalls.pluginName, pluginName),
				marketplace ? eq(pluginInstalls.marketplace, marketplace) : undefined,
			),
		)
		.orderBy(asc(pluginInstalls.marketplace));

	if (rows.length > 1) {
		throw new AmbiguousPluginError(
			pluginName,
			rows.map((entry) => entry.marketplace),
		);
	}

	const row = rows[0];
	if (!row) return null;

	const [{ count } = { count: 0 }] = await db
		.select({ count: countDistinct(pluginInstalls.id) })
		.from(pluginInstalls)
		.where(
			and(
				eq(pluginInstalls.userId, userId),
				eq(pluginInstalls.pluginName, pluginName),
			),
		);

	return { id: row.id, marketplace: row.marketplace, siblings: count };
}

export async function installById(
	userId: string,
	installId: string,
): Promise<InstalledPlugin | null> {
	const [row] = await db
		.select({
			id: pluginInstalls.id,
			manifest: pluginInstalls.manifest,
			marketplace: pluginInstalls.marketplace,
			pluginName: pluginInstalls.pluginName,
			organizationPluginId: pluginInstalls.organizationPluginId,
		})
		.from(pluginInstalls)
		.where(
			and(
				eq(pluginInstalls.id, installId),
				eq(pluginInstalls.userId, userId),
				eq(pluginInstalls.enabled, true),
			),
		)
		.limit(1);

	if (!row) return null;
	return resolveInstall(row, row.pluginName);
}

export async function installedManifest(
	userId: string,
	pluginName: string,
	marketplace?: string,
): Promise<PluginManifest | null> {
	return (
		(await installedPlugin(userId, pluginName, marketplace))?.manifest ?? null
	);
}
