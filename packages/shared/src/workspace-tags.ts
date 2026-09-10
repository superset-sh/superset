import { z } from "zod";

/**
 * Single source of truth for workspace tag limits. Tags are stored
 * already-normalized (trimmed + lowercased); spaces are allowed.
 */
export const WORKSPACE_TAG_MAX_LENGTH = 64;
export const WORKSPACE_TAGS_MAX_PER_WORKSPACE = 32;

/**
 * Scope for tag folders that belong to no project — the Sessions lane. A
 * folder is a (scope, tag) pair, where scope is normally a project id;
 * those are UUIDs, so this sentinel can never collide with one.
 */
export const SESSIONS_TAG_SCOPE = "sessions";

/** Router boundary for the only two valid folder owner shapes. */
export const tagFolderScopeInputSchema = z.union([
	z.literal(SESSIONS_TAG_SCOPE),
	z.string().uuid(),
]);

export type TagFolderScopeInput = z.infer<typeof tagFolderScopeInputSchema>;

/** The scope a tag folder lives under: a project id, or the Sessions lane. */
export function tagFolderScope(projectId: string | null): string {
	return projectId ?? SESSIONS_TAG_SCOPE;
}

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

/** Router-boundary schema for one tag; parses to its stored normalized form. */
export const workspaceTagInputSchema = z
	.string()
	.superRefine((tag, ctx) => {
		if (normalizeWorkspaceTag(tag) == null) {
			ctx.addIssue({
				code: "custom",
				message: `Tag must be 1-${WORKSPACE_TAG_MAX_LENGTH} characters after trimming`,
			});
		}
	})
	.transform((tag) => normalizeWorkspaceTag(tag) as string);

/**
 * Router-boundary schema. Rejects (never silently drops) invalid tags and
 * over-cap sets; parses to the normalized, deduped, sorted set. The cap
 * applies to the deduped set — that is what gets stored.
 */
export const workspaceTagsInputSchema = z
	.array(workspaceTagInputSchema)
	.transform((tags) => normalizeWorkspaceTags(tags))
	.refine((tags) => tags.length <= WORKSPACE_TAGS_MAX_PER_WORKSPACE, {
		message: `A workspace can have at most ${WORKSPACE_TAGS_MAX_PER_WORKSPACE} tags`,
	});

export type WorkspaceTagsInput = z.infer<typeof workspaceTagsInputSchema>;

/** One tag on one workspace and who applied it (null = unknown/legacy). */
export interface WorkspaceTagAssignment {
	tag: string;
	createdByUserId: string | null;
}

/**
 * Tags are personal: a tag is shown to the user who applied it, so one
 * person's sidebar grouping never appears in a teammate's. A tag with no
 * known creator (written before tags had one, or by a caller that carries
 * no user) stays visible to everyone, and a viewer with no identity sees
 * everything — both keep single-user hosts behaving as before.
 */
export function isWorkspaceTagVisibleTo(
	createdByUserId: string | null | undefined,
	viewerUserId: string | null | undefined,
): boolean {
	return (
		createdByUserId == null ||
		viewerUserId == null ||
		createdByUserId === viewerUserId
	);
}

/** The normalized, sorted tag set a viewer sees on one workspace. */
export function visibleWorkspaceTags(
	assignments: readonly WorkspaceTagAssignment[] | null | undefined,
	viewerUserId: string | null | undefined,
): string[] {
	if (assignments == null) return [];
	return normalizeWorkspaceTags(
		assignments
			.filter((assignment) =>
				isWorkspaceTagVisibleTo(assignment.createdByUserId, viewerUserId),
			)
			.map((assignment) => assignment.tag),
	);
}
