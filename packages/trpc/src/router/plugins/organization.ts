import { db } from "@superset/db/client";
import { organizationPlugins } from "@superset/db/schema";
import { getConnector } from "@superset/shared/connectors";
import { organizationMarketplace } from "@superset/shared/plugins";
import { pluginManifestSchema } from "@superset/shared/plugins/manifest-schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { userError } from "../../i18n-error";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin } from "../integration/utils";
import { requireActiveOrgId } from "../utils/active-org";
import {
	type PluginManifest,
	pluginConnector,
	supersetExtension,
} from "./manifest";
import { connectorServer } from "./proxy/resolve-target";

function invalid(reason: string) {
	return userError({
		code: "BAD_REQUEST",
		message: `This plugin cannot be added to the organization: ${reason}`,
		i18nKey: "serverError.plugins.organizationPluginInvalid",
		params: { reason },
	});
}

function unknown(name: string) {
	return userError({
		code: "NOT_FOUND",
		message: `Unknown plugin "${name}"`,
		i18nKey: "serverError.plugins.unknownPlugin",
		params: { plugin: name },
	});
}

/** Why an organization may not publish this manifest, or null when it may. */
export function organizationPluginProblem(
	manifest: PluginManifest,
): string | null {
	const slug = pluginConnector(manifest);
	const url = supersetExtension(manifest)?.mcp?.url;

	if (slug) {
		const connector = getConnector(slug);
		if (!connector) return `"${slug}" is not a connector Superset knows`;
		if (!connector.methods.some((method) => connectorServer(method))) {
			return `the ${slug} connector has no tool server of its own, so an organization plugin cannot use it`;
		}
		return null;
	}

	if (!url) return "it names no connector and no mcp url, so it has no tools";
	if (!url.startsWith("https://")) return "its mcp url must be https";
	return null;
}

async function requireAdmin(ctx: Parameters<typeof requireActiveOrgId>[0]) {
	const organizationId = requireActiveOrgId(ctx);
	await verifyOrgAdmin(ctx.session.user.id, organizationId);
	return organizationId;
}

export const organizationPluginsRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = requireActiveOrgId(ctx);
		const isAdmin = await verifyOrgAdmin(
			ctx.session.user.id,
			organizationId,
		).then(
			() => true,
			() => false,
		);
		const rows = await db
			.select()
			.from(organizationPlugins)
			.where(
				and(
					eq(organizationPlugins.organizationId, organizationId),
					isAdmin ? undefined : isNotNull(organizationPlugins.publishedAt),
				),
			)
			.orderBy(asc(organizationPlugins.name));

		return rows.map((row) => ({
			name: row.name,
			version: row.version,
			marketplace: organizationMarketplace(organizationId),
			description: (row.manifest as PluginManifest).description ?? "",
			connector: pluginConnector(row.manifest as PluginManifest) ?? null,
			publishedAt: row.publishedAt,
			uploadedByUserId: row.uploadedByUserId,
			updatedAt: row.updatedAt,
		}));
	}),

	upload: protectedProcedure
		.input(
			z.object({
				manifest: z.unknown(),
				/** The version this upload expects to replace; refused if another upload landed first. */
				replaces: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAdmin(ctx);

			const parsed = pluginManifestSchema.safeParse(input.manifest);
			if (!parsed.success) {
				throw invalid(
					parsed.error.issues[0]?.message ?? "plugin.json is not valid",
				);
			}
			const manifest = parsed.data as PluginManifest;
			const problem = organizationPluginProblem(manifest);
			if (problem) throw invalid(problem);

			const [existing] = await db
				.select({
					id: organizationPlugins.id,
					version: organizationPlugins.version,
				})
				.from(organizationPlugins)
				.where(
					and(
						eq(organizationPlugins.organizationId, organizationId),
						eq(organizationPlugins.name, manifest.name),
					),
				)
				.limit(1);

			if (existing?.version === manifest.version) {
				throw invalid(`version ${manifest.version} is already uploaded`);
			}
			if (input.replaces && existing && existing.version !== input.replaces) {
				throw invalid(
					`it was built on version ${input.replaces}, and version ${existing.version} is current`,
				);
			}

			const [row] = await db
				.insert(organizationPlugins)
				.values({
					organizationId,
					name: manifest.name,
					version: manifest.version,
					manifest,
					uploadedByUserId: ctx.session.user.id,
				})
				.onConflictDoUpdate({
					target: [
						organizationPlugins.organizationId,
						organizationPlugins.name,
					],
					set: {
						version: manifest.version,
						manifest,
						uploadedByUserId: ctx.session.user.id,
					},
				})
				.returning();

			return {
				name: manifest.name,
				version: manifest.version,
				marketplace: organizationMarketplace(organizationId),
				publishedAt: row?.publishedAt ?? null,
				replaced: existing?.version ?? null,
			};
		}),

	setPublished: protectedProcedure
		.input(z.object({ name: z.string().min(1), published: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAdmin(ctx);
			const [row] = await db
				.update(organizationPlugins)
				.set({ publishedAt: input.published ? new Date() : null })
				.where(
					and(
						eq(organizationPlugins.organizationId, organizationId),
						eq(organizationPlugins.name, input.name),
					),
				)
				.returning();
			if (!row) throw unknown(input.name);
			return { name: row.name, publishedAt: row.publishedAt };
		}),

	remove: protectedProcedure
		.input(z.object({ name: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAdmin(ctx);
			const [row] = await db
				.delete(organizationPlugins)
				.where(
					and(
						eq(organizationPlugins.organizationId, organizationId),
						eq(organizationPlugins.name, input.name),
					),
				)
				.returning({ name: organizationPlugins.name });
			if (!row) throw unknown(input.name);
			return { removed: row.name };
		}),
} satisfies TRPCRouterRecord;
