import { db } from "@superset/db/client";
import { environments, organizations } from "@superset/db/schema";
import {
	SANDBOX_IMAGE_NAME,
	SHARED_ENVIRONMENT_NAME,
	SHARED_ENVIRONMENT_ORGANIZATION_ID,
} from "@superset/shared/constants";

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
			provider: "vercel",
			sourceKind: "image",
			sourceRef: imageRef,
		})
		.onConflictDoUpdate({
			target: [environments.organizationId, environments.name],
			set: { provider: "vercel", sourceRef: imageRef, archivedAt: null },
		});

	return { imageRef };
}

if (import.meta.main) {
	const { imageRef } = await seedSharedEnvironments();
	console.log(`seeded shared environment -> ${imageRef}`);
	process.exit(0);
}
