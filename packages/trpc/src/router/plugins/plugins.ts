import { db } from "@superset/db/client";
import {
	pluginConnections,
	pluginInstalls,
	pluginMarketplaces,
} from "@superset/db/schema";
import {
	FIRST_PARTY_MANIFESTS,
	firstPartyManifest,
} from "@superset/shared/plugins";
import type { TRPCError, TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { userError } from "../../i18n-error";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
	AmbiguousPluginError,
	bundledSource,
	disconnect,
	getConnection,
	installedPlugin,
	installForConnection,
	installRecord,
	listConnections,
	manifestAuth,
	templateScope,
	upsertConnection,
} from "./connections";
import { callTool, listTools, PluginDispatchError } from "./dispatch";
import {
	authMethod,
	DEFAULT_CREDENTIAL_INPUT,
	type PluginManifest,
	supersetExtension,
	trustedManifest,
} from "./manifest";
import { resolveIdentity } from "./oauth";

const FIRST_PARTY = "superset";

function dispatchError(error: unknown): never {
	if (error instanceof PluginDispatchError) {
		const code =
			error.status === 401
				? "UNAUTHORIZED"
				: error.status === 404
					? "NOT_FOUND"
					: error.status === 501
						? "NOT_IMPLEMENTED"
						: error.status === 400
							? "BAD_REQUEST"
							: "BAD_GATEWAY";
		throw userError({
			code,
			message: error.message,
			i18nKey: "serverError.plugins.dispatchFailed",
			params: { reason: error.message },
		});
	}
	throw error;
}

function ambiguous(error: unknown): never {
	if (error instanceof AmbiguousPluginError) {
		throw userError({
			code: "CONFLICT",
			message: error.message,
			i18nKey: "serverError.plugins.ambiguousPlugin",
			params: { reason: error.message },
		});
	}
	throw error;
}

function notInstalled(name: string): TRPCError {
	return userError({
		code: "NOT_FOUND",
		message: `Plugin "${name}" is not installed`,
		i18nKey: "serverError.plugins.notInstalled",
		params: { plugin: name },
	});
}

async function connectionContext(userId: string, connectionId: string) {
	const connection = await getConnection(userId, connectionId);
	if (!connection) {
		throw userError({
			code: "NOT_FOUND",
			message: "Connection not found",
			i18nKey: "serverError.plugins.connectionNotFound",
		});
	}

	const install = await installForConnection(userId, connection).catch(
		ambiguous,
	);
	if (!install) throw notInstalled(connection.pluginName);

	return {
		connection,
		install,
		source: await bundledSource(userId, install.marketplace),
	};
}

function describe(
	manifest: PluginManifest & {
		skills?: { name: string; description: string }[];
	},
	marketplace: string,
) {
	const extension = supersetExtension(manifest);
	return {
		name: manifest.name,
		version: manifest.version,
		description: manifest.description ?? "",
		marketplace,
		displayName: extension?.interface?.displayName ?? manifest.name,
		category: extension?.interface?.category ?? "Developer tools",
		icon: extension?.interface?.icon,
		authMethods: (extension?.auth ?? []).map((method) => ({
			type: method.type,
			label: method.label ?? null,
			inputs: method.inputs ?? [],
		})),
		mcpUrl: extension?.mcp?.url ?? null,
		skills: manifest.skills ?? [],
		homepage: (manifest as { homepage?: string }).homepage ?? null,
		author: (manifest as { author?: { name?: string } }).author?.name ?? null,
		license: (manifest as { license?: string }).license ?? null,
	};
}

const marketplacesRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const rows = await db
			.select()
			.from(pluginMarketplaces)
			.where(eq(pluginMarketplaces.userId, ctx.session.user.id))
			.orderBy(asc(pluginMarketplaces.name));

		return [
			{
				name: FIRST_PARTY,
				builtin: true as const,
				sourceKind: "builtin",
				plugins: Object.keys(FIRST_PARTY_MANIFESTS).length,
				repo: null,
				ref: null,
				path: null,
				addedAt: null as Date | null,
			},
			...rows
				.filter((row) => row.name !== FIRST_PARTY)
				.map((row) => ({
					name: row.name,
					builtin: false as const,
					sourceKind: row.sourceKind,
					plugins: null,
					repo: row.repo,
					ref: row.ref,
					path: row.path,
					addedAt: row.addedAt as Date | null,
				})),
		];
	}),

	add: protectedProcedure
		.input(
			z.discriminatedUnion("sourceKind", [
				z.object({
					name: z.string().min(1),
					sourceKind: z.literal("github"),
					repo: z.string().min(1),
					ref: z.string().min(1).optional(),
					path: z.string().min(1).optional(),
				}),
				z.object({
					name: z.string().min(1),
					sourceKind: z.literal("path"),
					repo: z.string().min(1).optional(),
					ref: z.string().min(1).optional(),
					path: z.string().min(1),
				}),
			]),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.name === FIRST_PARTY) {
				throw userError({
					code: "BAD_REQUEST",
					message: `"${FIRST_PARTY}" is built in and cannot be replaced`,
					i18nKey: "serverError.plugins.marketplaceReserved",
					params: { name: FIRST_PARTY },
				});
			}

			const [row] = await db
				.insert(pluginMarketplaces)
				.values({
					userId: ctx.session.user.id,
					organizationId: null,
					name: input.name,
					sourceKind: input.sourceKind,
					repo: input.repo ?? null,
					ref: input.ref ?? null,
					path: input.path ?? null,
				})
				.onConflictDoUpdate({
					target: [pluginMarketplaces.userId, pluginMarketplaces.name],
					set: {
						sourceKind: input.sourceKind,
						repo: input.repo ?? null,
						ref: input.ref ?? null,
						path: input.path ?? null,
					},
				})
				.returning();

			return { id: row?.id, name: input.name };
		}),

	remove: protectedProcedure
		.input(z.object({ name: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			if (input.name === FIRST_PARTY) {
				throw userError({
					code: "BAD_REQUEST",
					message: `"${FIRST_PARTY}" is built in and cannot be removed`,
					i18nKey: "serverError.plugins.marketplaceBuiltinRemove",
					params: { name: FIRST_PARTY },
				});
			}

			const dependents = await db
				.select({ pluginName: pluginInstalls.pluginName })
				.from(pluginInstalls)
				.where(
					and(
						eq(pluginInstalls.userId, ctx.session.user.id),
						eq(pluginInstalls.marketplace, input.name),
					),
				);
			if (dependents.length) {
				const names = dependents.map((d) => d.pluginName).join(", ");
				throw userError({
					code: "CONFLICT",
					message: `${dependents.length} installed plugin${dependents.length === 1 ? "" : "s"} came from "${input.name}": ${names}. Remove them first.`,
					i18nKey: "serverError.plugins.marketplaceHasInstalls",
					params: { name: input.name, plugins: names },
				});
			}

			const removed = await db
				.delete(pluginMarketplaces)
				.where(
					and(
						eq(pluginMarketplaces.userId, ctx.session.user.id),
						eq(pluginMarketplaces.name, input.name),
					),
				)
				.returning({ id: pluginMarketplaces.id });

			if (!removed.length) {
				throw userError({
					code: "NOT_FOUND",
					message: `"${input.name}" is not added`,
					i18nKey: "serverError.plugins.marketplaceNotAdded",
					params: { name: input.name },
				});
			}
			return { removed: input.name };
		}),
} satisfies TRPCRouterRecord;

const connectionsRouter = {
	list: protectedProcedure
		.input(z.object({ plugin: z.string().min(1).optional() }).optional())
		.query(async ({ ctx, input }) => {
			const rows = await listConnections(ctx.session.user.id, input?.plugin);
			return rows.map((connection) => ({
				id: connection.id,
				plugin: connection.pluginName,
				account: connection.externalAccountLabel,
				accountId: connection.externalAccountId,
				scopes: connection.scopes,
				createdAt: connection.createdAt,
			}));
		}),

	disconnect: protectedProcedure
		.input(z.object({ connectionId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const removed = await disconnect(ctx.session.user.id, input.connectionId);
			if (!removed) {
				throw userError({
					code: "NOT_FOUND",
					message: "Connection not found",
					i18nKey: "serverError.plugins.connectionNotFound",
				});
			}
			return { disconnected: input.connectionId };
		}),
} satisfies TRPCRouterRecord;

const toolsRouter = {
	list: protectedProcedure
		.input(z.object({ connectionId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			const { connection, install, source } = await connectionContext(
				ctx.session.user.id,
				input.connectionId,
			);
			try {
				const tools = await listTools(
					install.manifest,
					await templateScope(connection),
					connection.authMethod,
					source,
				);
				return { plugin: connection.pluginName, tools };
			} catch (error) {
				dispatchError(error);
			}
		}),

	call: protectedProcedure
		.input(
			z.object({
				connectionId: z.uuid(),
				tool: z.string().min(1),
				arguments: z.record(z.string(), z.unknown()).default({}),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { connection, install, source } = await connectionContext(
				ctx.session.user.id,
				input.connectionId,
			);
			try {
				const result = await callTool(
					install.manifest,
					await templateScope(connection),
					input.tool,
					input.arguments,
					connection.authMethod,
					source,
				);
				return { result };
			} catch (error) {
				dispatchError(error);
			}
		}),
} satisfies TRPCRouterRecord;

export const pluginsRouter = createTRPCRouter({
	list: protectedProcedure.query(async ({ ctx }) => {
		const [installs, connections] = await Promise.all([
			db
				.select()
				.from(pluginInstalls)
				.where(eq(pluginInstalls.userId, ctx.session.user.id))
				.orderBy(asc(pluginInstalls.pluginName)),
			db
				.select({
					id: pluginConnections.id,
					pluginName: pluginConnections.pluginName,
					account: pluginConnections.externalAccountLabel,
				})
				.from(pluginConnections)
				.where(
					and(
						eq(pluginConnections.userId, ctx.session.user.id),
						isNull(pluginConnections.disconnectedAt),
					),
				),
		]);

		const held = new Map<string, { id: string; account: string | null }[]>();
		for (const row of connections) {
			const list = held.get(row.pluginName) ?? [];
			list.push({ id: row.id, account: row.account });
			held.set(row.pluginName, list);
		}

		const installed = installs.map((row) => {
			const held_ = held.get(row.pluginName) ?? [];
			const published =
				row.marketplace === FIRST_PARTY
					? firstPartyManifest(row.pluginName)?.version
					: undefined;
			return {
				...describe(row.manifest as PluginManifest, row.marketplace),
				installed: true,
				enabled: row.enabled,
				installedAt: row.installedAt as Date | null,
				latestVersion: published ?? null,
				connections: held_,
				accounts: held_
					.map((connection) => connection.account)
					.filter((account): account is string => account !== null),
			};
		});

		const installedKeys = new Set(
			installs.map((row) => `${row.marketplace}/${row.pluginName}`),
		);

		const available = Object.values(FIRST_PARTY_MANIFESTS)
			.filter(
				(manifest) => !installedKeys.has(`${FIRST_PARTY}/${manifest.name}`),
			)
			.map((manifest) => ({
				...describe(manifest as unknown as PluginManifest, FIRST_PARTY),
				installed: false,
				enabled: false,
				installedAt: null as Date | null,
				latestVersion: (manifest.version as string) ?? null,
				connections: [] as { id: string; account: string | null }[],
				accounts: [] as string[],
			}));

		return [...installed, ...available];
	}),

	install: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				marketplace: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.marketplace && input.marketplace !== FIRST_PARTY) {
				throw userError({
					code: "BAD_REQUEST",
					message: `Account install resolves "${FIRST_PARTY}" manifests only, so "${input.name}" from "${input.marketplace}" cannot be installed to your account yet. It stays installed on this machine.`,
					i18nKey: "serverError.plugins.marketplaceNotResolvable",
					params: { plugin: input.name, marketplace: input.marketplace },
				});
			}

			const manifest = firstPartyManifest(input.name);
			if (!manifest) {
				throw userError({
					code: "NOT_FOUND",
					message: `Unknown plugin "${input.name}"`,
					i18nKey: "serverError.plugins.unknownPlugin",
					params: { plugin: input.name },
				});
			}

			const [row] = await db
				.insert(pluginInstalls)
				.values({
					userId: ctx.session.user.id,
					organizationId: null,
					marketplace: FIRST_PARTY,
					pluginName: input.name,
					version: manifest.version,
					manifest,
					enabled: true,
				})
				.onConflictDoUpdate({
					target: [
						pluginInstalls.userId,
						pluginInstalls.marketplace,
						pluginInstalls.pluginName,
					],
					// An install over an existing row is an update, so it carries the
					// new manifest and leaves `enabled` alone: re-enabling here
					// would turn a plugin the user disabled back on behind them.
					set: { version: manifest.version, manifest },
				})
				.returning();

			return {
				id: row?.id,
				plugin: input.name,
				version: manifest.version,
				marketplace: FIRST_PARTY,
				needsConnection: Boolean(manifest.extensions?.superset?.auth),
			};
		}),

	setEnabled: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				marketplace: z.string().min(1).optional(),
				enabled: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const install = await installRecord(
				ctx.session.user.id,
				input.name,
				input.marketplace,
			).catch(ambiguous);
			if (!install) throw notInstalled(input.name);

			const [row] = await db
				.update(pluginInstalls)
				.set({ enabled: input.enabled })
				.where(eq(pluginInstalls.id, install.id))
				.returning();
			if (!row) throw notInstalled(input.name);

			return {
				plugin: input.name,
				marketplace: row.marketplace,
				enabled: row.enabled,
			};
		}),

	uninstall: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				marketplace: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const install = await installRecord(
				ctx.session.user.id,
				input.name,
				input.marketplace,
			).catch(ambiguous);
			if (!install) throw notInstalled(input.name);

			const { id, marketplace, siblings } = install;

			await db
				.update(pluginConnections)
				.set({
					disconnectedAt: new Date(),
					disconnectReason: "plugin_uninstalled",
					accessToken: "",
					refreshToken: null,
					config: null,
				})
				.where(
					and(
						eq(pluginConnections.userId, ctx.session.user.id),
						isNull(pluginConnections.disconnectedAt),
						siblings === 1
							? or(
									eq(pluginConnections.installId, id),
									and(
										isNull(pluginConnections.installId),
										eq(pluginConnections.pluginName, input.name),
									),
								)
							: eq(pluginConnections.installId, id),
					),
				);

			await db.delete(pluginInstalls).where(eq(pluginInstalls.id, id));

			return { uninstalled: input.name, marketplace };
		}),

	connectApiKey: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				inputs: z.record(z.string(), z.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const install = await installedPlugin(
				ctx.session.user.id,
				input.name,
			).catch(ambiguous);
			if (!install) throw notInstalled(input.name);

			const authSpec = authMethod(manifestAuth(install.manifest), "api_key");
			if (!authSpec) {
				throw userError({
					code: "BAD_REQUEST",
					message: `Plugin "${input.name}" does not use api_key auth`,
					i18nKey: "serverError.plugins.noApiKeyAuth",
					params: { plugin: input.name },
				});
			}

			const inputs: Record<string, string> = {};
			for (const spec of authSpec.inputs ?? []) {
				const value = input.inputs[spec.name];
				if (value) inputs[spec.name] = value;
				else if (spec.required) {
					throw userError({
						code: "BAD_REQUEST",
						message: `Missing required input "${spec.name}"`,
						i18nKey: "serverError.plugins.missingInput",
						params: { input: spec.name },
					});
				}
			}

			const credentialName =
				authSpec.credential_input ?? DEFAULT_CREDENTIAL_INPUT;
			const credential = inputs[credentialName];
			if (!credential) {
				throw userError({
					code: "BAD_REQUEST",
					message: `Missing "${credentialName}"`,
					i18nKey: "serverError.plugins.missingInput",
					params: { input: credentialName },
				});
			}

			let identity: { id: string; label: string | null };
			try {
				identity = await resolveIdentity(
					trustedManifest(install.marketplace) ? authSpec.identity : undefined,
					{ config: { access_token: credential }, inputs },
					authSpec.type,
					authSpec,
				);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				throw userError({
					code: "BAD_REQUEST",
					message: `Could not verify the credential: ${reason}`,
					i18nKey: "serverError.plugins.credentialUnverified",
					params: { reason },
				});
			}

			const connection = await upsertConnection({
				userId: ctx.session.user.id,
				organizationId: null,
				pluginName: input.name,
				installId: install.id,
				authMethod: authSpec.type,
				accessToken: credential,
				inputs,
				secretInputs: [
					credentialName,
					...(authSpec.inputs ?? [])
						.filter((spec) => spec.secret && spec.name !== credentialName)
						.map((spec) => spec.name),
				],
				externalAccountId: identity.id,
				externalAccountLabel: identity.label,
			});

			return {
				connectionId: connection.id,
				plugin: input.name,
				account: connection.externalAccountLabel,
			};
		}),

	marketplaces: marketplacesRouter,
	connections: connectionsRouter,
	tools: toolsRouter,
});
