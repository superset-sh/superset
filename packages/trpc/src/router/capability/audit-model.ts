import { db } from "@superset/db/client";
import { modelProviderModels, modelProviders } from "@superset/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
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

	return (
		rows.find((row) => isPreferredAuditModel(row)) ??
		rows.find((row) => row.protocol.startsWith("openai")) ??
		rows[0] ??
		null
	);
}
