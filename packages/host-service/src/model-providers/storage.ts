import { randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import type { HostDb } from "../db";
import {
	type ModelProviderProtocol,
	modelProviderModels,
	modelProviders,
	workspaceAgentModelConfigs,
} from "../db/schema";
import { decryptSecret, encryptSecret } from "../security/crypto-storage";
import type { ModelProviderModelSummary, ModelProviderSummary } from "./types";

export interface UpsertProviderModelInput {
	modelId: string;
	displayName?: string;
	enabled?: boolean;
	capabilities?: Record<string, unknown>;
}

export interface UpsertModelProviderInput {
	id?: string;
	name: string;
	protocol: ModelProviderProtocol;
	baseUrl: string;
	enabled: boolean;
	secret?: string | null;
	models: UpsertProviderModelInput[];
}

export interface StoredModelProvider extends ModelProviderSummary {
	secret: string | null;
}

function parseCapabilities(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>;
		}
	} catch {}
	return {};
}

function toModelSummary(
	row: typeof modelProviderModels.$inferSelect,
): ModelProviderModelSummary {
	return {
		id: row.id,
		providerId: row.providerId,
		modelId: row.modelId,
		displayName: row.displayName?.trim() || row.modelId,
		enabled: row.enabled,
		capabilities: parseCapabilities(row.capabilitiesJson),
	};
}

function toSummary(
	row: typeof modelProviders.$inferSelect,
	models: ModelProviderModelSummary[],
): ModelProviderSummary {
	return {
		id: row.id,
		name: row.name,
		protocol: row.protocol,
		baseUrl: row.baseUrl,
		enabled: row.enabled,
		hasSecret: Boolean(row.secretEncrypted),
		models,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
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

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.trim().replace(/\/+$/, "");
}

function normalizeModels(
	providerId: string,
	models: UpsertProviderModelInput[],
): Array<typeof modelProviderModels.$inferInsert> {
	const seen = new Set<string>();
	const rows: Array<typeof modelProviderModels.$inferInsert> = [];
	for (const [index, model] of models.entries()) {
		const modelId = model.modelId.trim();
		if (!modelId || seen.has(modelId)) continue;
		seen.add(modelId);
		rows.push({
			id: randomUUID(),
			providerId,
			modelId,
			displayName: model.displayName?.trim() || null,
			enabled: model.enabled ?? true,
			capabilitiesJson: JSON.stringify(model.capabilities ?? {}),
			displayOrder: index,
		});
	}
	return rows;
}

export function listModelProviders(db: HostDb): ModelProviderSummary[] {
	const providerRows = db
		.select()
		.from(modelProviders)
		.orderBy(asc(modelProviders.createdAt), asc(modelProviders.name))
		.all();
	if (providerRows.length === 0) return [];

	const providerIds = providerRows.map((provider) => provider.id);
	const modelRows = db
		.select()
		.from(modelProviderModels)
		.where(inArray(modelProviderModels.providerId, providerIds))
		.orderBy(
			asc(modelProviderModels.providerId),
			asc(modelProviderModels.displayOrder),
			asc(modelProviderModels.modelId),
		)
		.all();

	const modelsByProvider = new Map<string, ModelProviderModelSummary[]>();
	for (const row of modelRows) {
		const models = modelsByProvider.get(row.providerId) ?? [];
		models.push(toModelSummary(row));
		modelsByProvider.set(row.providerId, models);
	}

	return providerRows.map((row) =>
		toSummary(row, modelsByProvider.get(row.id) ?? []),
	);
}

export function getModelProvider(
	db: HostDb,
	id: string,
): StoredModelProvider | null {
	const row = db
		.select()
		.from(modelProviders)
		.where(eq(modelProviders.id, id))
		.get();
	if (!row) return null;
	const models = db
		.select()
		.from(modelProviderModels)
		.where(eq(modelProviderModels.providerId, id))
		.orderBy(
			asc(modelProviderModels.displayOrder),
			asc(modelProviderModels.modelId),
		)
		.all()
		.map(toModelSummary);
	return { ...toSummary(row, models), secret: decryptProviderSecret(row) };
}

export function getProviderByModelRef(
	db: HostDb,
	ref: { providerId: string; modelId: string },
): StoredModelProvider | null {
	const provider = getModelProvider(db, ref.providerId);
	if (!provider?.enabled) return null;
	if (
		!provider.models.some(
			(model) => model.enabled && model.modelId === ref.modelId,
		)
	) {
		return null;
	}
	return provider;
}

export function upsertModelProvider(
	db: HostDb,
	input: UpsertModelProviderInput,
): ModelProviderSummary {
	const now = Date.now();
	const id = input.id?.trim() || randomUUID();
	const existing = getModelProvider(db, id);
	const secret =
		input.secret !== undefined
			? (input.secret?.trim() ?? "")
			: (existing?.secret ?? undefined);
	const row: typeof modelProviders.$inferInsert = {
		id,
		name: input.name.trim(),
		protocol: input.protocol,
		baseUrl: normalizeBaseUrl(input.baseUrl),
		enabled: input.enabled,
		secretEncrypted: secret ? encryptSecret(secret) : null,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	};

	db.insert(modelProviders)
		.values(row)
		.onConflictDoUpdate({
			target: modelProviders.id,
			set: {
				name: row.name,
				protocol: row.protocol,
				baseUrl: row.baseUrl,
				enabled: row.enabled,
				secretEncrypted: row.secretEncrypted,
				updatedAt: row.updatedAt,
			},
		})
		.run();

	db.delete(modelProviderModels)
		.where(eq(modelProviderModels.providerId, id))
		.run();
	const modelRows = normalizeModels(id, input.models);
	if (modelRows.length > 0) {
		db.insert(modelProviderModels).values(modelRows).run();
	}

	const saved = getModelProvider(db, id);
	if (!saved) throw new Error("Failed to read saved model provider");
	const { secret: _secret, ...summary } = saved;
	return summary;
}

export function replaceModelProviders(
	db: HostDb,
	inputs: UpsertModelProviderInput[],
): ModelProviderSummary[] {
	const incomingIds = new Set(
		inputs
			.map((input) => input.id?.trim())
			.filter((id): id is string => Boolean(id)),
	);
	for (const provider of listModelProviders(db)) {
		if (!incomingIds.has(provider.id)) {
			deleteModelProvider(db, provider.id);
		}
	}

	for (const input of inputs) {
		upsertModelProvider(db, input);
	}

	return listModelProviders(db);
}

export function deleteModelProvider(
	db: HostDb,
	id: string,
): { deleted: boolean } {
	const existing = db
		.select({ id: modelProviders.id })
		.from(modelProviders)
		.where(eq(modelProviders.id, id))
		.get();
	if (!existing) return { deleted: false };
	db.delete(workspaceAgentModelConfigs)
		.where(eq(workspaceAgentModelConfigs.providerId, id))
		.run();
	db.delete(modelProviders).where(eq(modelProviders.id, id)).run();
	return { deleted: true };
}
