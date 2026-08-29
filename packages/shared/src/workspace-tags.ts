import { z } from "zod";

/**
 * Single source of truth for workspace tag limits. Tags are stored
 * already-normalized (trimmed + lowercased); spaces are allowed.
 */
export const WORKSPACE_TAG_MAX_LENGTH = 64;
export const WORKSPACE_TAGS_MAX_PER_WORKSPACE = 32;

/**
 * Trim + lowercase. Returns null for empty, over-length, or missing input.
 * Accepts null/undefined because persisted rows written before a field
 * existed carry undefined — callers must not need their own guard.
 */
export function normalizeWorkspaceTag(
	tag: string | null | undefined,
): string | null {
	if (tag == null) {
		return null;
	}
	const normalized = tag.trim().toLowerCase();
	if (normalized.length === 0 || normalized.length > WORKSPACE_TAG_MAX_LENGTH) {
		return null;
	}
	return normalized;
}

/**
 * Normalize a set: normalize each tag, drop invalid ones, dedupe, sort.
 * Sorted so a create broadcast and a later list agree on order.
 */
export function normalizeWorkspaceTags(
	tags: readonly (string | null | undefined)[] | null | undefined,
): string[] {
	if (tags == null) {
		return [];
	}
	const unique = new Set<string>();
	for (const tag of tags) {
		const normalized = normalizeWorkspaceTag(tag);
		if (normalized != null) {
			unique.add(normalized);
		}
	}
	return [...unique].sort();
}

/**
 * Router-boundary schema. Rejects (never silently drops) invalid tags and
 * over-cap sets; parses to the normalized, deduped, sorted set. The cap
 * applies to the deduped set — that is what gets stored.
 */
export const workspaceTagsInputSchema = z
	.array(z.string())
	.superRefine((tags, ctx) => {
		for (const [index, tag] of tags.entries()) {
			if (normalizeWorkspaceTag(tag) == null) {
				ctx.addIssue({
					code: "custom",
					message: `Tag must be 1-${WORKSPACE_TAG_MAX_LENGTH} characters after trimming`,
					path: [index],
				});
			}
		}
	})
	.transform((tags) => normalizeWorkspaceTags(tags))
	.refine((tags) => tags.length <= WORKSPACE_TAGS_MAX_PER_WORKSPACE, {
		message: `A workspace can have at most ${WORKSPACE_TAGS_MAX_PER_WORKSPACE} tags`,
	});

export type WorkspaceTagsInput = z.infer<typeof workspaceTagsInputSchema>;
