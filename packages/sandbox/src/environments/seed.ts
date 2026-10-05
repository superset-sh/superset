import { db } from "@superset/db/client";
import { environments, organizations } from "@superset/db/schema";
import {
	SANDBOX_IMAGE_NAME,
	SHARED_ENVIRONMENT_NAME,
	SHARED_ENVIRONMENT_ORGANIZATION_ID,
} from "@superset/shared/constants";
import { and, eq } from "drizzle-orm";

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

	const shared = await db.query.environments.findFirst({
		where: and(
			eq(environments.organizationId, SHARED_ENVIRONMENT_ORGANIZATION_ID),
			eq(environments.name, SHARED_ENVIRONMENT_NAME),
		),
		columns: { id: true },
	});
	if (shared) {
		await db
			.update(environments)
			.set({ provider: "vercel", sourceRef: imageRef, archivedAt: null })
			.where(eq(environments.id, shared.id));
	} else {
		await db.insert(environments).values({
			organizationId: SHARED_ENVIRONMENT_ORGANIZATION_ID,
			name: SHARED_ENVIRONMENT_NAME,
			provider: "vercel",
			sourceKind: "image",
			sourceRef: imageRef,
		});
	}

	return { imageRef };
}

if (import.meta.main) {
	const { imageRef } = await seedSharedEnvironments();
	console.log(`seeded shared environment -> ${imageRef}`);
	process.exit(0);
}
