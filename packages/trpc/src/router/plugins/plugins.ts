import { db } from "@superset/db/client";
import {
	connections,
	pluginInstalls,
	pluginMarketplaces,
} from "@superset/db/schema";
import {
	FIRST_PARTY_MANIFESTS,
	firstPartyManifest,
} from "@superset/shared/plugins";
import type { TRPCError, TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { userError } from "../../i18n-error";
import { AmbiguousConnectionError } from "../../lib/connectors/lookup";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
	AmbiguousPluginError,
	installedPlugin,
	installRecord,
} from "./connections";
import {
	type PluginManifest,
	pluginConnector,
	pluginNeedsConnection,
	supersetExtension,
} from "./manifest";
import { forgetUpstreamTools } from "./proxy";

const FIRST_PARTY = "superset";

function ambiguous(error: unknown): never {
	if (error instanceof AmbiguousPluginError) {
		throw userError({
			code: "CONFLICT",
			message: error.message,
			i18nKey: "serverError.plugins.ambiguousPlugin",
			params: { reason: error.message },
		});
	}
	if (error instanceof AmbiguousConnectionError) {
		throw userError({
			code: "CONFLICT",
			message: error.message,
			i18nKey: "serverError.plugins.ambiguousConnection",
			params: { connector: error.connector },
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
		connector: pluginConnector(manifest) ?? null,
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
			const install = input?.plugin
				? await installedPlugin(ctx.session.user.id, input.plugin).catch(
						() => null,
					)
				: null;
			const wanted = install ? pluginConnector(install.manifest) : undefined;

			const rows = await db
				.select({
					id: connections.id,
					connector: connections.connector,
					account: connections.externalAccountLabel,
					accountId: connections.externalAccountId,
					user: connections.externalUserLabel,
					scopes: connections.scopes,
					createdAt: connections.createdAt,
				})
				.from(connections)
				.where(
					and(
						eq(connections.connectedByUserId, ctx.session.user.id),
						isNull(connections.disconnectedAt),
						wanted ? eq(connections.connector, wanted) : undefined,
					),
				);

			return rows.map((row) => ({
				id: row.id,
				plugin: row.connector,
				account: row.user ?? row.account,
				accountId: row.accountId,
				scopes: row.scopes,
				createdAt: row.createdAt,
			}));
		}),

	disconnect: protectedProcedure
		.input(z.object({ connectionId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const [row] = await db
				.update(connections)
				.set({ disconnectedAt: new Date(), disconnectReason: "user" })
				.where(
					and(
						eq(connections.id, input.connectionId),
						eq(connections.connectedByUserId, ctx.session.user.id),
						isNull(connections.disconnectedAt),
					),
				)
				.returning({ id: connections.id });

			if (!row) {
				throw userError({
					code: "NOT_FOUND",
					message: "Connection not found",
					i18nKey: "serverError.plugins.connectionNotFound",
				});
			}
			forgetUpstreamTools(row.id);
			return { disconnected: input.connectionId };
		}),
} satisfies TRPCRouterRecord;

export const pluginsRouter = createTRPCRouter({
	list: protectedProcedure.query(async ({ ctx }) => {
		const [installs, live] = await Promise.all([
			db
				.select()
				.from(pluginInstalls)
				.where(eq(pluginInstalls.userId, ctx.session.user.id))
				.orderBy(asc(pluginInstalls.pluginName)),
			db
				.select({
					id: connections.id,
					connector: connections.connector,
					account: connections.externalAccountLabel,
					user: connections.externalUserLabel,
				})
				.from(connections)
				.where(
					and(
						eq(connections.connectedByUserId, ctx.session.user.id),
						isNull(connections.disconnectedAt),
					),
				),
		]);

		const held = new Map<
			string,
			{ id: string; account: string | null; user: string | null }[]
		>();
		for (const row of live) {
			const list = held.get(row.connector) ?? [];
			list.push({ id: row.id, account: row.account, user: row.user });
			held.set(row.connector, list);
		}

		const installed = installs.map((row) => {
			const slug = pluginConnector(row.manifest as PluginManifest);
			const held_ = slug ? (held.get(slug) ?? []) : [];
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
					.map((connection) => connection.user ?? connection.account)
					.filter((account): account is string => account !== null),
			};
		});

		const installedKeys = new Set(
			installs.map((row) => `${row.marketplace}/${row.pluginName}`),
		);

		const claimed = new Set(
			installs
				.map((row) => pluginConnector(row.manifest as PluginManifest))
				.filter((slug): slug is string => slug !== undefined),
		);

		const orphaned = [...held.entries()]
			.filter(([slug]) => !claimed.has(slug))
			.map(([slug, rows]) => ({
				name: slug,
				version: "",
				description: "",
				marketplace: FIRST_PARTY,
				displayName: slug,
				category: "Developer tools",
				icon: undefined,
				connector: slug,
				mcpUrl: null,
				skills: [] as { name: string; description: string }[],
				homepage: null,
				author: null,
				license: null,
				installed: false,
				enabled: false,
				installedAt: null as Date | null,
				latestVersion: null,
				connections: rows,
				accounts: rows
					.map((connection) => connection.user ?? connection.account)
					.filter((account): account is string => account !== null),
			}));

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

		return [...installed, ...orphaned, ...available];
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
				connector: pluginConnector(manifest) ?? null,
				needsConnection: pluginNeedsConnection(manifest),
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

			const { id, marketplace } = install;

			const [uninstalled] = await db
				.select({ manifest: pluginInstalls.manifest })
				.from(pluginInstalls)
				.where(eq(pluginInstalls.id, id))
				.limit(1);

			await db.delete(pluginInstalls).where(eq(pluginInstalls.id, id));

			const connector = uninstalled
				? pluginConnector(uninstalled.manifest as PluginManifest)
				: null;

			const stillShared =
				connector &&
				(
					await db
						.select({ manifest: pluginInstalls.manifest })
						.from(pluginInstalls)
						.where(eq(pluginInstalls.userId, ctx.session.user.id))
				).some(
					(entry) =>
						pluginConnector(entry.manifest as PluginManifest) === connector,
				);

			const disconnected =
				connector && !stillShared
					? await db
							.update(connections)
							.set({
								disconnectedAt: new Date(),
								disconnectReason: "plugin_uninstalled",
							})
							.where(
								and(
									eq(connections.connector, connector),
									eq(connections.ownerKind, "user"),
									eq(connections.connectedByUserId, ctx.session.user.id),
									isNull(connections.disconnectedAt),
								),
							)
							.returning({ id: connections.id })
					: [];

			for (const row of disconnected) forgetUpstreamTools(row.id);

			return {
				uninstalled: input.name,
				marketplace,
				disconnected: disconnected.length,
			};
		}),

	marketplaces: marketplacesRouter,
	connections: connectionsRouter,
});
