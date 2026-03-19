import { createHash } from "node:crypto";
import { db } from "@superset/db/client";
import { tasks } from "@superset/db/schema";
import { and, eq, like, or } from "drizzle-orm";

export function buildLinearWebhookEventId(rawBody: string): string {
	return createHash("sha256").update(rawBody).digest("hex");
}

export async function resolveLinearTaskSlug({
	organizationId,
	preferredSlug,
	currentTaskId,
}: {
	organizationId: string;
	preferredSlug: string;
	currentTaskId?: string;
}): Promise<string> {
	const relatedTasks = await db
		.select({ id: tasks.id, slug: tasks.slug })
		.from(tasks)
		.where(
			and(
				eq(tasks.organizationId, organizationId),
				or(
					eq(tasks.slug, preferredSlug),
					like(tasks.slug, `${preferredSlug}-%`),
				),
			),
		);

	const usedSlugs = new Set<string>();

	for (const task of relatedTasks) {
		if (task.id === currentTaskId) {
			continue;
		}

		usedSlugs.add(task.slug);
	}

	if (!usedSlugs.has(preferredSlug)) {
		return preferredSlug;
	}

	let suffix = 1;
	let candidate = `${preferredSlug}-${suffix}`;

	while (usedSlugs.has(candidate)) {
		suffix += 1;
		candidate = `${preferredSlug}-${suffix}`;
	}

	return candidate;
}
