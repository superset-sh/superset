import { randomUUID } from "node:crypto";
import { db, dbWs } from "@superset/db/client";
import {
	type ModelProviderProtocol,
	modelProviderModels,
	modelProviders,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { decryptSecret, encryptSecret } from "../project/secrets/utils/crypto";
import { requireActiveOrgMembership } from "../utils/active-org";

const protocolSchema = z.enum(["anthropic", "openai-chat", "openai-responses"]);

const providerModelInputSchema = z.object({
	modelId: z.string().trim().min(1),
	displayName: z.string().trim().optional(),
	enabled: z.boolean().optional(),
	capabilities: z.record(z.string(), z.unknown()).optional(),
});

const upsertProviderSchema = z.object({
	id: z.string().uuid().optional(),
	name: z.string().trim().min(1),
	protocol: protocolSchema,
	baseUrl: z.url(),
	enabled: z.boolean().default(true),
	secret: z.string().optional(),
	models: z.array(providerModelInputSchema).min(1),
});

const fetchRemoteModelsSchema = z.object({
	id: z.string().uuid().optional(),
	protocol: protocolSchema.optional(),
	baseUrl: z.url().optional(),
	secret: z.string().optional(),
});

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.trim().replace(/\/+$/, "");
}

function appendProviderPath(baseUrl: string, path: string): string {
	const normalizedBase = normalizeBaseUrl(baseUrl);
	if (normalizedBase.endsWith(path)) return normalizedBase;
	if (normalizedBase.endsWith("/v1") && path.startsWith("/v1/")) {
		return `${normalizedBase}${path.slice(3)}`;
	}
	return `${normalizedBase}${path}`;
}

function decryptProviderSecret(
	row: typeof modelProviders.$inferSelect,
): string | null {
	if (!row.secretEncrypted) return null;
	try {
		return decryptSecret(row.secretEncrypted);
	} catch {
		return null;
	}
}

function publicProviderSummary(
	row: typeof modelProviders.$inferSelect,
	models: Array<typeof modelProviderModels.$inferSelect>,
) {
	return {
		id: row.id,
		name: row.name,
		protocol: row.protocol,
		baseUrl: row.baseUrl,
		enabled: row.enabled,
		hasSecret: Boolean(row.secretEncrypted),
		models: models.map((model) => ({
			id: model.id,
			providerId: model.providerId,
			modelId: model.modelId,
			displayName: model.displayName?.trim() || model.modelId,
			enabled: model.enabled,
			capabilities: model.capabilities ?? {},
		})),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

async function listProvidersWithModels(organizationId: string) {
	const providerRows = await db
		.select()
		.from(modelProviders)
		.where(eq(modelProviders.organizationId, organizationId))
		.orderBy(asc(modelProviders.createdAt), asc(modelProviders.name));

	if (providerRows.length === 0) return [];

	const modelRows = await db
		.select()
		.from(modelProviderModels)
		.where(
			inArray(
				modelProviderModels.providerId,
				providerRows.map((provider) => provider.id),
			),
		)
		.orderBy(
			asc(modelProviderModels.providerId),
			asc(modelProviderModels.displayOrder),
			asc(modelProviderModels.modelId),
		);

	const modelsByProvider = new Map<
		string,
		Array<typeof modelProviderModels.$inferSelect>
	>();
	for (const model of modelRows) {
		const bucket = modelsByProvider.get(model.providerId) ?? [];
		bucket.push(model);
		modelsByProvider.set(model.providerId, bucket);
	}

	return providerRows.map((provider) => ({
		provider,
		models: modelsByProvider.get(provider.id) ?? [],
	}));
}

function modelListFromBody(body: unknown): unknown[] {
	if (Array.isArray(body)) return body;
	if (typeof body !== "object" || body === null || Array.isArray(body))
		return [];
	const record = body as Record<string, unknown>;
	if (Array.isArray(record.data)) return record.data;
	if (Array.isArray(record.models)) return record.models;
	return [];
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseRemoteModelList(body: unknown) {
	const seen = new Set<string>();
	const models: Array<{ modelId: string; displayName: string }> = [];
	for (const item of modelListFromBody(body)) {
		const record =
			typeof item === "object" && item !== null && !Array.isArray(item)
				? (item as Record<string, unknown>)
				: null;
		const modelId = record
			? (stringValue(record.id) ??
				stringValue(record.model) ??
				stringValue(record.name))
			: stringValue(item);
		if (!modelId || seen.has(modelId)) continue;
		seen.add(modelId);
		const displayName = record
			? (stringValue(record.display_name) ??
				stringValue(record.displayName) ??
				stringValue(record.name) ??
				modelId)
			: modelId;
		models.push({ modelId, displayName });
	}
	return models;
}

function providerHeaders(
	protocol: ModelProviderProtocol,
	secret: string,
): Headers {
	const headers = new Headers({ accept: "application/json" });
	if (protocol === "anthropic") {
		headers.set("x-api-key", secret);
		headers.set("authorization", `Bearer ${secret}`);
		headers.set("anthropic-version", "2023-06-01");
		return headers;
	}
	headers.set("authorization", `Bearer ${secret}`);
	return headers;
}

async function fetchRemoteModelList(args: {
	protocol: ModelProviderProtocol;
	baseUrl: string;
	secret: string;
}) {
	let response: Response;
	try {
		response = await fetch(appendProviderPath(args.baseUrl, "/v1/models"), {
			method: "GET",
			headers: providerHeaders(args.protocol, args.secret),
		});
	} catch {
		throw new Error("Model list request failed before receiving a response");
	}
	if (!response.ok) {
		throw new Error(`Model list request failed with HTTP ${response.status}`);
	}
	const body = (await response.json()) as unknown;
	const models = parseRemoteModelList(body);
	if (models.length === 0) {
		throw new Error("Model list response did not contain models");
	}
	return models;
}

export const modelProviderRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const rows = await listProvidersWithModels(organizationId);
		return rows.map(({ provider, models }) =>
			publicProviderSummary(provider, models),
		);
	}),

	syncPayload: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const rows = await listProvidersWithModels(organizationId);
		return rows.map(({ provider, models }) => ({
			...publicProviderSummary(provider, models),
			secret: decryptProviderSecret(provider),
		}));
	}),

	upsert: protectedProcedure
		.input(upsertProviderSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const existing = input.id
				? await db.query.modelProviders.findFirst({
						where: and(
							eq(modelProviders.id, input.id),
							eq(modelProviders.organizationId, organizationId),
						),
					})
				: null;
			if (input.id && !existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Model provider not found",
				});
			}

			const id = input.id ?? randomUUID();
			const secret =
				input.secret !== undefined
					? input.secret.trim()
					: existing
						? decryptProviderSecret(existing)
						: null;
			const baseUrl = normalizeBaseUrl(input.baseUrl);
			const saved = await dbWs.transaction(async (tx) => {
				const [provider] = await tx
					.insert(modelProviders)
					.values({
						id,
						organizationId,
						createdByUserId: existing?.createdByUserId ?? ctx.session.user.id,
						name: input.name.trim(),
						protocol: input.protocol,
						baseUrl,
						enabled: input.enabled,
						secretEncrypted: secret ? encryptSecret(secret) : null,
					})
					.onConflictDoUpdate({
						target: modelProviders.id,
						set: {
							name: input.name.trim(),
							protocol: input.protocol,
							baseUrl,
							enabled: input.enabled,
							secretEncrypted: secret ? encryptSecret(secret) : null,
							updatedAt: new Date(),
						},
					})
					.returning();
				if (!provider) throw new Error("Failed to save model provider");

				await tx
					.delete(modelProviderModels)
					.where(eq(modelProviderModels.providerId, provider.id));
				const modelRows = input.models
					.map((model, index) => ({
						providerId: provider.id,
						modelId: model.modelId.trim(),
						displayName: model.displayName?.trim() || null,
						enabled: model.enabled ?? true,
						capabilities: model.capabilities ?? {},
						displayOrder: index,
					}))
					.filter((model) => model.modelId.length > 0);
				if (modelRows.length > 0) {
					await tx.insert(modelProviderModels).values(modelRows);
				}

				return provider;
			});

			const withModels = (await listProvidersWithModels(organizationId)).find(
				(row) => row.provider.id === saved.id,
			);
			return publicProviderSummary(saved, withModels?.models ?? []);
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [deleted] = await dbWs
				.delete(modelProviders)
				.where(
					and(
						eq(modelProviders.id, input.id),
						eq(modelProviders.organizationId, organizationId),
					),
				)
				.returning({ id: modelProviders.id });
			return { deleted: Boolean(deleted) };
		}),

	fetchRemoteModels: protectedProcedure
		.input(fetchRemoteModelsSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const provider = input.id
				? await db.query.modelProviders.findFirst({
						where: and(
							eq(modelProviders.id, input.id),
							eq(modelProviders.organizationId, organizationId),
						),
					})
				: null;
			if (input.id && !provider) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Model provider not found",
				});
			}

			const protocol = input.protocol ?? provider?.protocol;
			const baseUrl = input.baseUrl?.trim() || provider?.baseUrl;
			const secret =
				input.secret?.trim() ||
				(provider ? decryptProviderSecret(provider) : null);
			if (!protocol || !baseUrl) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Provider protocol and base URL are required",
				});
			}
			if (!secret) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Provider credential is required",
				});
			}

			try {
				return {
					models: await fetchRemoteModelList({ protocol, baseUrl, secret }),
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Failed to fetch remote model list",
				});
			}
		}),
} satisfies TRPCRouterRecord;
