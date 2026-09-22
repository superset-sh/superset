import { db } from "@superset/db/client";
import { connections } from "@superset/db/schema";
import {
	CONNECTOR_SLUGS,
	type ConnectorMethod,
	getConnector,
} from "@superset/shared/connectors";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
	connectorMethod,
	NEEDS_REAUTH,
	probeIdentity,
	requireConnector,
	upsertConnection,
} from "../../lib/connectors";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";
import { forgetUpstreamTools } from "../plugins/proxy";

function methodSummary(method: ConnectorMethod) {
	return {
		type: method.type,
		label: method.label ?? method.type,
		inputs: method.type === "api_key" ? method.inputs : [],
	};
}

export const connectorsRouter = {
	catalog: protectedProcedure.query(() =>
		CONNECTOR_SLUGS.map((slug) => {
			const connector = requireConnector(slug);
			return {
				slug,
				displayName: connector.displayName,
				icon: connector.icon,
				category: connector.category,
				scope: connector.scope,
				methods: connector.methods.map(methodSummary),
			};
		}),
	),

	get: protectedProcedure
		.input(z.object({ slug: z.string() }))
		.query(({ input }) => {
			const connector = getConnector(input.slug);
			if (!connector)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Unknown connector",
				});
			return {
				slug: input.slug,
				displayName: connector.displayName,
				icon: connector.icon,
				category: connector.category,
				scope: connector.scope,
				methods: connector.methods.map(methodSummary),
			};
		}),

	status: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			// A connection whose refresh failed is still the user's connection:
			// dropping it here would offer "Connect" for an account they already
			// linked, losing the distinction between never-connected and expired.
			const rows = await db.query.connections.findMany({
				where: and(
					eq(connections.organizationId, input.organizationId),
					or(
						isNull(connections.disconnectedAt),
						eq(connections.disconnectReason, NEEDS_REAUTH),
					),
				),
				columns: {
					id: true,
					connector: true,
					ownerKind: true,
					connectedByUserId: true,
					externalAccountId: true,
					externalAccountLabel: true,
					externalUserId: true,
					externalUserLabel: true,
					disconnectedAt: true,
					disconnectReason: true,
				},
			});

			return rows
				.filter(
					(row) =>
						row.ownerKind === "org" ||
						row.connectedByUserId === ctx.session.user.id,
				)
				.map(({ disconnectedAt, disconnectReason, ...row }) => ({
					...row,
					needsReauth: disconnectedAt !== null,
				}));
		}),

	connectApiKey: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				slug: z.string(),
				inputs: z.record(z.string(), z.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connector = requireConnector(input.slug);
			const method = connectorMethod(connector, "api_key");
			if (method.type !== "api_key")
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This connector has no API key method",
				});

			for (const field of method.inputs)
				if (field.required && !input.inputs[field.name])
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `${field.label ?? field.name} is required`,
					});

			const credential = input.inputs[method.credential_input];
			if (!credential)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Missing ${method.credential_input}`,
				});

			const identity = await probeIdentity(input.slug, method, credential);

			const result = await upsertConnection({
				connector,
				slug: input.slug,
				authMethod: "api_key",
				organizationId: input.organizationId,
				userId: ctx.session.user.id,
				tokens: {
					accessToken: credential,
					refreshToken: null,
					expiresAt: null,
					scopes: null,
					stored: {},
					raw: {},
				},
				identity,
			});

			if (result.conflict)
				throw new TRPCError({
					code: "CONFLICT",
					message: result.conflict.ownerEmail
						? `Already connected by ${result.conflict.ownerEmail}`
						: "Already connected in another organization",
				});

			return { connectionId: result.connectionId };
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid(), connectionId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			// `status` still lists a needs-reauth row, so discarding one has to be
			// reachable from the same screen that offers to reconnect it.
			const reachable = or(
				isNull(connections.disconnectedAt),
				eq(connections.disconnectReason, NEEDS_REAUTH),
			);

			const [existing] = await db
				.select({
					ownerKind: connections.ownerKind,
					connectedByUserId: connections.connectedByUserId,
				})
				.from(connections)
				.where(
					and(
						eq(connections.id, input.connectionId),
						eq(connections.organizationId, input.organizationId),
						reachable,
					),
				)
				.limit(1);

			if (!existing)
				throw new TRPCError({ code: "NOT_FOUND", message: "No connection" });

			if (existing.ownerKind === "org")
				await verifyOrgAdmin(ctx.session.user.id, input.organizationId);
			else if (existing.connectedByUserId !== ctx.session.user.id)
				throw new TRPCError({ code: "NOT_FOUND", message: "No connection" });

			const [row] = await db
				.update(connections)
				.set({ disconnectedAt: new Date(), disconnectReason: "user" })
				.where(
					and(
						eq(connections.id, input.connectionId),
						eq(connections.organizationId, input.organizationId),
						reachable,
					),
				)
				.returning({ id: connections.id });

			if (!row)
				throw new TRPCError({ code: "NOT_FOUND", message: "No connection" });
			forgetUpstreamTools(row.id);
			return { disconnected: row.id };
		}),
} satisfies TRPCRouterRecord;
