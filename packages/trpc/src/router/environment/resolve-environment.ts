import { db } from "@superset/db/client";
import { environmentSecrets, environments } from "@superset/db/schema";
import { isReservedKey } from "@superset/shared/environment-secrets";
import { and, eq } from "drizzle-orm";
import { decryptSecret } from "./secrets/utils/crypto";

export interface ResolvedEnvironment {
	id: string;
	provider: string;
	sourceKind: "image" | "fork";
	sourceRef: string;
	envs: Record<string, string>;
}

export async function resolveEnvironment(
	environmentId: string,
	organizationId: string,
): Promise<ResolvedEnvironment | null> {
	const row = await db.query.environments.findFirst({
		where: eq(environments.id, environmentId),
	});
	if (!row) return null;

	const rows = await db
		.select({
			key: environmentSecrets.key,
			encryptedValue: environmentSecrets.encryptedValue,
		})
		.from(environmentSecrets)
		.where(
			and(
				eq(environmentSecrets.environmentId, environmentId),
				eq(environmentSecrets.organizationId, organizationId),
			),
		);

	const envs: Record<string, string> = {};
	for (const secret of rows) {
		if (isReservedKey(secret.key)) continue;
		envs[secret.key] = decryptSecret(secret.encryptedValue, {
			environmentId,
			organizationId,
			key: secret.key,
		});
	}

	return {
		id: row.id,
		provider: row.provider,
		sourceKind: row.sourceKind,
		sourceRef: row.sourceRef,
		envs,
	};
}
