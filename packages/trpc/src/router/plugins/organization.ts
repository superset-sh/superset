import { db } from "@superset/db/client";
import {
	organizationPluginSources,
	organizationPlugins,
} from "@superset/db/schema";
import { ROLE_HIERARCHY } from "@superset/shared/auth";
import {
	ORGANIZATION_PLUGIN_ACCESS,
	organizationMarketplace,
} from "@superset/shared/plugins";
import type { TRPCRouterRecord } from "@trpc/server";
import { Client } from "@upstash/qstash";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { userError } from "../../i18n-error";
import {
	githubRepositoriesOutOfReach,
	githubUserTokenFor,
} from "../../lib/github-user";
import {
	accessibleTo,
	memberRole,
	organizationBundleKey,
	syncOrganizationPluginSource,
} from "../../lib/organization-plugins";
import { getObject } from "../../lib/r2";
import { protectedProcedure } from "../../trpc";
import { findInstalledRepository } from "../integration/github/find-installed-repository";
import { verifyOrgAdmin } from "../integration/utils";
import { requireActiveOrgId } from "../utils/active-org";
import { type PluginManifest, pluginConnector } from "./manifest";

const qstash = new Client({ token: env.QSTASH_TOKEN });

export const ORGANIZATION_PLUGIN_SYNC_PATH =
	"/api/organization-plugins/jobs/sync";

function unknown(name: string) {
	return userError({
		code: "NOT_FOUND",
		message: `Unknown plugin "${name}"`,
		i18nKey: "serverError.plugins.unknownPlugin",
		params: { plugin: name },
	});
}

function unknownSource() {
	return userError({
		code: "NOT_FOUND",
		message: "That plugin source does not exist",
		i18nKey: "serverError.plugins.unknownPluginSource",
	});
}

async function requireAdmin(ctx: Parameters<typeof requireActiveOrgId>[0]) {
	const organizationId = requireActiveOrgId(ctx);
	await verifyOrgAdmin(ctx.session.user.id, organizationId);
	return organizationId;
}

async function isAdmin(userId: string, organizationId: string) {
	return verifyOrgAdmin(userId, organizationId).then(
		() => true,
		() => false,
	);
}

async function requestSync(sourceId: string) {
	if (env.NODE_ENV === "development") {
		await syncOrganizationPluginSource(sourceId);
		return;
	}
	await qstash.publishJSON({
		url: `${env.NEXT_PUBLIC_API_URL}${ORGANIZATION_PLUGIN_SYNC_PATH}`,
		body: { sourceId },
		retries: 3,
	});
}

/**
 * An admin can add only a repository they can read themselves: through their
 * connected GitHub account when they have one, as a cloud workspace checks,
 * otherwise one the organization's GitHub App is installed on.
 */
async function reachableRepository(
	userId: string,
	organizationId: string,
	repo: string,
): Promise<string> {
	const token = await githubUserTokenFor(userId);
	if (!token) {
		return (await findInstalledRepository(organizationId, repo)).repo.fullName;
	}
	const [owner = "", name = ""] = repo.split("/");
	const outOfReach = await githubRepositoriesOutOfReach({
		token,
		repositories: [{ owner, name, fullName: repo }],
	});
	if (outOfReach.length) {
		throw userError({
			code: "FORBIDDEN",
			message: `Your GitHub account cannot read ${repo}`,
			i18nKey: "serverError.plugins.pluginSourceOutOfReach",
			params: { repo },
		});
	}
	return repo;
}

const policySchema = z.partialRecord(
	z.enum(ROLE_HIERARCHY),
	z.enum(ORGANIZATION_PLUGIN_ACCESS),
);

const sourcesRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireAdmin(ctx);
		return db
			.select()
			.from(organizationPluginSources)
			.where(eq(organizationPluginSources.organizationId, organizationId))
			.orderBy(asc(organizationPluginSources.repo));
	}),

	add: protectedProcedure
		.input(
			z.object({
				repo: z
					.string()
					.regex(/^[\w.-]+\/[\w.-]+$/, "owner/name of a GitHub repository"),
				ref: z.string().min(1).optional(),
				path: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAdmin(ctx);
			const repo = await reachableRepository(
				ctx.session.user.id,
				organizationId,
				input.repo,
			);
			const path = (input.path ?? "")
				.split("/")
				.filter((s) => s && s !== ".")
				.join("/");
			if (path.split("/").includes("..")) {
				throw userError({
					code: "BAD_REQUEST",
					message: "The path must stay inside the repository",
					i18nKey: "serverError.plugins.pluginSourcePathOutside",
				});
			}

			const [source] = await db
				.insert(organizationPluginSources)
				.values({
					organizationId,
					repo,
					ref: input.ref ?? null,
					path,
					addedByUserId: ctx.session.user.id,
				})
				.onConflictDoUpdate({
					target: [
						organizationPluginSources.organizationId,
						organizationPluginSources.repo,
						organizationPluginSources.path,
					],
					set: { ref: input.ref ?? null, addedByUserId: ctx.session.user.id },
				})
				.returning();
			if (!source) throw unknownSource();

			await requestSync(source.id);
			return source;
		}),

	sync: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAdmin(ctx);
			const source = await db.query.organizationPluginSources.findFirst({
				where: and(
					eq(organizationPluginSources.id, input.id),
					eq(organizationPluginSources.organizationId, organizationId),
				),
			});
			if (!source) throw unknownSource();
			await requestSync(source.id);
			return { requested: source.id };
		}),

	remove: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAdmin(ctx);
			const [row] = await db
				.delete(organizationPluginSources)
				.where(
					and(
						eq(organizationPluginSources.id, input.id),
						eq(organizationPluginSources.organizationId, organizationId),
					),
				)
				.returning({ id: organizationPluginSources.id });
			if (!row) throw unknownSource();
			return { removed: row.id };
		}),
} satisfies TRPCRouterRecord;

export const organizationPluginsRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = requireActiveOrgId(ctx);
		const userId = ctx.session.user.id;
		const admin = await isAdmin(userId, organizationId);
		const role = await memberRole(userId, organizationId);
		const rows = await db
			.select({
				plugin: organizationPlugins,
				repo: organizationPluginSources.repo,
			})
			.from(organizationPlugins)
			.leftJoin(
				organizationPluginSources,
				eq(organizationPluginSources.id, organizationPlugins.sourceId),
			)
			.where(
				and(
					eq(organizationPlugins.organizationId, organizationId),
					admin ? undefined : accessibleTo(role),
				),
			)
			.orderBy(asc(organizationPlugins.name));

		return rows.map(({ plugin, repo }) => ({
			name: plugin.name,
			version: plugin.version,
			marketplace: organizationMarketplace(organizationId),
			description: (plugin.manifest as PluginManifest).description ?? "",
			connector: pluginConnector(plugin.manifest as PluginManifest) ?? null,
			sourceId: plugin.sourceId,
			repo: repo ?? null,
			policy: plugin.installPolicy,
			removedFromSourceAt: plugin.removedFromSourceAt,
			updatedAt: plugin.updatedAt,
		}));
	}),

	bundle: protectedProcedure
		.input(z.object({ name: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			const role = await memberRole(ctx.session.user.id, organizationId);
			const [row] = await db
				.select({
					name: organizationPlugins.name,
					version: organizationPlugins.version,
					contentHash: organizationPlugins.contentHash,
				})
				.from(organizationPlugins)
				.where(
					and(
						eq(organizationPlugins.organizationId, organizationId),
						eq(organizationPlugins.name, input.name),
						accessibleTo(role),
					),
				)
				.limit(1);
			if (!row) throw unknown(input.name);

			const object = await getObject(
				organizationBundleKey(organizationId, row.contentHash),
			);
			if (!object) throw unknown(input.name);
			return {
				...row,
				marketplace: organizationMarketplace(organizationId),
				bundle: Buffer.from(await object.arrayBuffer()).toString("base64"),
			};
		}),

	setPolicy: protectedProcedure
		.input(z.object({ name: z.string().min(1), policy: policySchema }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAdmin(ctx);
			const [row] = await db
				.update(organizationPlugins)
				.set({ installPolicy: input.policy })
				.where(
					and(
						eq(organizationPlugins.organizationId, organizationId),
						eq(organizationPlugins.name, input.name),
					),
				)
				.returning();
			if (!row) throw unknown(input.name);
			return { name: row.name, policy: row.installPolicy };
		}),

	sources: sourcesRouter,
} satisfies TRPCRouterRecord;
