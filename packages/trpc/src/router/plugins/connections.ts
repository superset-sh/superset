import { db } from "@superset/db/client";
import {
	pluginConnections,
	pluginInstalls,
	pluginMarketplaces,
	type SelectPluginConnection,
} from "@superset/db/schema";
import {
	DEFAULT_MARKETPLACE,
	DEFAULT_MARKETPLACE_REF,
	DEFAULT_MARKETPLACE_REPO,
} from "@superset/shared/plugins";
import { and, asc, countDistinct, desc, eq, isNull } from "drizzle-orm";
import {
	decryptOptional,
	decryptSecret,
	encryptOptional,
	encryptSecret,
} from "./crypto";
import {
	type PluginManifest,
	supersetExtension,
	type TemplateScope,
} from "./manifest";

export interface ConnectionSecrets {
	accessToken: string;
	refreshToken: string | null;
	inputs: Record<string, unknown>;
}

export interface UpsertConnectionInput {
	userId: string;
	organizationId: string | null;
	pluginName: string;
	installId?: string | null;
	authMethod: string;
	accessToken: string;
	refreshToken?: string | null;
	tokenExpiresAt?: Date | null;
	scopes?: string[] | null;
	inputs?: Record<string, unknown>;
	secretInputs?: string[];
	externalAccountId: string;
	externalAccountLabel?: string | null;
}

async function encryptInputs(
	inputs: Record<string, unknown>,
	secretNames: string[],
): Promise<Record<string, unknown>> {
	const secrets = new Set(secretNames);
	const out: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(inputs)) {
		out[name] =
			secrets.has(name) && typeof value === "string"
				? { __encrypted: await encryptSecret(value) }
				: value;
	}
	return out;
}

async function decryptInputs(
	config: unknown,
): Promise<Record<string, unknown>> {
	if (!config || typeof config !== "object") return {};
	const out: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(
		config as Record<string, unknown>,
	)) {
		if (value && typeof value === "object" && "__encrypted" in value) {
			out[name] = await decryptSecret(
				(value as { __encrypted: string }).__encrypted,
			);
		} else {
			out[name] = value;
		}
	}
	return out;
}

export async function upsertConnection(
	input: UpsertConnectionInput,
): Promise<SelectPluginConnection> {
	const values = {
		userId: input.userId,
		organizationId: input.organizationId,
		pluginName: input.pluginName,
		installId: input.installId ?? null,
		authMethod: input.authMethod,
		accessToken: await encryptSecret(input.accessToken),
		refreshToken: await encryptOptional(input.refreshToken),
		tokenExpiresAt: input.tokenExpiresAt ?? null,
		scopes: input.scopes ?? null,
		config: await encryptInputs(input.inputs ?? {}, input.secretInputs ?? []),
		externalAccountId: input.externalAccountId,
		externalAccountLabel: input.externalAccountLabel ?? null,
	};

	await db
		.update(pluginConnections)
		.set({ disconnectedAt: new Date(), disconnectReason: "install_removed" })
		.where(
			and(
				eq(pluginConnections.userId, values.userId),
				eq(pluginConnections.pluginName, values.pluginName),
				eq(pluginConnections.externalAccountId, values.externalAccountId),
				isNull(pluginConnections.installId),
				isNull(pluginConnections.disconnectedAt),
			),
		);

	const [row] = await db
		.insert(pluginConnections)
		.values(values)
		.onConflictDoUpdate({
			target: [
				pluginConnections.userId,
				pluginConnections.installId,
				pluginConnections.externalAccountId,
			],
			targetWhere: isNull(pluginConnections.disconnectedAt),
			set: {
				installId: values.installId,
				authMethod: values.authMethod,
				accessToken: values.accessToken,
				...(values.refreshToken ? { refreshToken: values.refreshToken } : {}),
				tokenExpiresAt: values.tokenExpiresAt,
				scopes: values.scopes,
				config: values.config,
				externalAccountLabel: values.externalAccountLabel,
				organizationId: values.organizationId,
			},
		})
		.returning();

	if (!row) throw new Error("Failed to persist connection");
	return row;
}

export async function listConnections(
	userId: string,
	pluginName?: string,
): Promise<SelectPluginConnection[]> {
	return await db
		.select()
		.from(pluginConnections)
		.where(
			and(
				eq(pluginConnections.userId, userId),
				isNull(pluginConnections.disconnectedAt),
				pluginName ? eq(pluginConnections.pluginName, pluginName) : undefined,
			),
		)
		.orderBy(desc(pluginConnections.createdAt));
}

export async function getConnection(
	userId: string,
	connectionId: string,
): Promise<SelectPluginConnection | null> {
	const [row] = await db
		.select()
		.from(pluginConnections)
		.where(
			and(
				eq(pluginConnections.id, connectionId),
				eq(pluginConnections.userId, userId),
				isNull(pluginConnections.disconnectedAt),
			),
		)
		.limit(1);
	return row ?? null;
}

export async function disconnect(
	userId: string,
	connectionId: string,
	reason = "user_disconnected",
): Promise<boolean> {
	const result = await db
		.update(pluginConnections)
		.set({
			disconnectedAt: new Date(),
			disconnectReason: reason,
			accessToken: "",
			refreshToken: null,
			config: null,
		})
		.where(
			and(
				eq(pluginConnections.id, connectionId),
				eq(pluginConnections.userId, userId),
				isNull(pluginConnections.disconnectedAt),
			),
		)
		.returning({ id: pluginConnections.id });
	return result.length > 0;
}

export async function connectionSecrets(
	connection: SelectPluginConnection,
): Promise<ConnectionSecrets> {
	return {
		accessToken: await decryptSecret(connection.accessToken),
		refreshToken: await decryptOptional(connection.refreshToken),
		inputs: await decryptInputs(connection.config),
	};
}

export async function templateScope(
	connection: SelectPluginConnection,
): Promise<TemplateScope> {
	const secrets = await connectionSecrets(connection);
	return {
		config: { access_token: secrets.accessToken },
		inputs: secrets.inputs,
	};
}

export interface InstalledPlugin {
	id: string;
	manifest: PluginManifest;
	marketplace: string;
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
	return {
		id: row.id,
		manifest: row.manifest as PluginManifest,
		marketplace: row.marketplace,
	};
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
	return {
		id: row.id,
		manifest: row.manifest as PluginManifest,
		marketplace: row.marketplace,
	};
}

export async function installForConnection(
	userId: string,
	connection: Pick<SelectPluginConnection, "installId" | "pluginName">,
): Promise<InstalledPlugin | null> {
	return connection.installId
		? await installById(userId, connection.installId)
		: null;
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

export interface BundledSource {
	repo: string;
	ref: string;
}

export async function bundledSource(
	userId: string,
	marketplace: string,
): Promise<BundledSource | null> {
	const [row] = await db
		.select()
		.from(pluginMarketplaces)
		.where(
			and(
				eq(pluginMarketplaces.userId, userId),
				eq(pluginMarketplaces.name, marketplace),
			),
		)
		.limit(1);

	if (!row) {
		return marketplace === DEFAULT_MARKETPLACE
			? { repo: DEFAULT_MARKETPLACE_REPO, ref: DEFAULT_MARKETPLACE_REF }
			: null;
	}
	if (row.sourceKind !== "github" || !row.repo) return null;
	return { repo: row.repo, ref: row.ref ?? "HEAD" };
}

export function manifestAuth(manifest: PluginManifest) {
	return supersetExtension(manifest)?.auth;
}
