import { db } from "../../packages/db/src/client.ts";
import {
	environments,
	organizations,
} from "../../packages/db/src/schema/index.ts";
import {
	SANDBOX_IMAGE_NAME,
	SHARED_ENVIRONMENT_NAME,
	SHARED_ENVIRONMENT_ORGANIZATION_ID,
} from "../../packages/shared/src/constants.ts";

const SHARED_ORGANIZATION = {
	id: SHARED_ENVIRONMENT_ORGANIZATION_ID,
	name: "Superset",
	slug: "superset-shared-environments",
} as const;

export async function seedSharedEnvironments(
	imageRef = SANDBOX_IMAGE_NAME,
): Promise<{ imageRef: string }> {
	await db
		.insert(organizations)
		.values(SHARED_ORGANIZATION)
		.onConflictDoNothing({ target: organizations.id });

	await db
		.insert(environments)
		.values({
			organizationId: SHARED_ENVIRONMENT_ORGANIZATION_ID,
			name: SHARED_ENVIRONMENT_NAME,
			provider: "blaxel",
			sourceKind: "image",
			sourceRef: imageRef,
		})
		.onConflictDoUpdate({
			target: [environments.organizationId, environments.name],
			set: { sourceRef: imageRef, archivedAt: null },
		});

	return { imageRef };
}

if (import.meta.main) {
	const { imageRef } = await seedSharedEnvironments();
	console.log(`seeded shared environment -> ${imageRef}`);
	process.exit(0);
}
