import { createHash } from "node:crypto";
import { db } from "@superset/db/client";
import { tasks } from "@superset/db/schema";
import { and, eq, like, or } from "drizzle-orm";

export function buildLinearWebhookEventId(rawBody: string): string {
	return createHash("sha256").update(rawBody).digest("hex");
}

export function buildLegacyLinearWebhookEventId({
	organizationId,
	webhookTimestamp,
}: {
	organizationId: string;
	webhookTimestamp: number;
}): string {
	return `${organizationId}-${webhookTimestamp}`;
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

function isLinearSlugConflictError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const pgError = error as Error & {
		code?: string;
		constraint?: string;
	};

	return (
		pgError.code === "23505" && pgError.constraint === "tasks_org_slug_unique"
	);
}

export async function writeLinearTaskWithSlugRetry<T>({
	organizationId,
	preferredSlug,
	currentTaskId,
	write,
	maxAttempts = 5,
}: {
	organizationId: string;
	preferredSlug: string;
	currentTaskId?: string;
	write: (slug: string) => Promise<T>;
	maxAttempts?: number;
}): Promise<{ result: T; slug: string }> {
	let lastError: unknown;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const slug = await resolveLinearTaskSlug({
			organizationId,
			preferredSlug,
			currentTaskId,
		});

		try {
			const result = await write(slug);
			return { result, slug };
		} catch (error) {
			if (!isLinearSlugConflictError(error) || attempt === maxAttempts - 1) {
				throw error;
			}

			lastError = error;
		}
	}

	throw lastError ?? new Error("Failed to persist Linear task slug");
}
