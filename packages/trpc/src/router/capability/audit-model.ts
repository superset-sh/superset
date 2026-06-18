import { db } from "@superset/db/client";
import { modelProviderModels, modelProviders } from "@superset/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { decryptSecret } from "../project/secrets/utils/crypto";
import type { AuditModelSelection } from "./audit";

function isPreferredAuditModel(selection: AuditModelSelection): boolean {
	const modelId = selection.modelId.toLowerCase();
	if (!selection.protocol.startsWith("openai")) return false;
	return modelId.includes("gpt") || modelId.includes("o");
}

export async function resolveCapabilityAuditModel(
	organizationId: string,
): Promise<AuditModelSelection | null> {
	const rows = await db
		.select({
			providerId: modelProviders.id,
			protocol: modelProviders.protocol,
			baseUrl: modelProviders.baseUrl,
			secretEncrypted: modelProviders.secretEncrypted,
			modelId: modelProviderModels.modelId,
		})
		.from(modelProviders)
		.innerJoin(
			modelProviderModels,
			eq(modelProviderModels.providerId, modelProviders.id),
		)
		.where(
			and(
				eq(modelProviders.organizationId, organizationId),
				eq(modelProviders.enabled, true),
				eq(modelProviderModels.enabled, true),
				isNotNull(modelProviders.secretEncrypted),
			),
		);

	const selections: AuditModelSelection[] = [];
	for (const row of rows) {
		if (!row.secretEncrypted) continue;
		try {
			selections.push({
				providerId: row.providerId,
				modelId: row.modelId,
				protocol: row.protocol,
				baseUrl: row.baseUrl,
				secret: decryptSecret(row.secretEncrypted),
			});
		} catch {}
	}

	return (
		selections.find((row) => isPreferredAuditModel(row)) ??
		selections.find((row) => row.protocol.startsWith("openai")) ??
		selections[0] ??
		null
	);
}
