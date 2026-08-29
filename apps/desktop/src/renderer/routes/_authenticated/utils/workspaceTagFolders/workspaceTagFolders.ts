import {
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
	WORKSPACE_TAG_MAX_LENGTH,
} from "@superset/shared/workspace-tags";

/**
 * A sidebar folder IS a tag: the folder exists because some workspace in the
 * project carries the tag, and membership is the tag itself. Local section
 * rows are presentation only (color, order, collapse) and appear only once
 * someone customises a folder. Every pass that decides "which container does
 * this workspace render in" — the project-tree builder, the top-level lane,
 * the flatten pass — must go through this module; the moment two of them
 * derive membership independently they disagree.
 */

/**
 * Synthetic tabOrder floor for folders that exist only because a tag does
 * (no local presentation row). Far above any user-assigned order, so derived
 * folders always render at the bottom of a project lane, deterministically.
 * Callers that renumber stored rows must never feed these back into
 * `getNextTabOrder`-style math.
 */
export const DERIVED_TAG_FOLDER_TAB_ORDER_BASE = 2 ** 31;

export interface TagFolderRef {
	sectionId: string;
	projectId: string;
	tag: string;
	tabOrder: number;
}

/**
 * The stored presentation row shape this module reads. `tag` is optional on
 * purpose: rows persisted before the field existed carry it ABSENT (i.e.
 * `undefined`, not `null`) — every read below guards with `== null`.
 */
export interface TagFolderSectionInput {
	sectionId: string;
	projectId: string;
	name: string;
	tabOrder: number;
	isCollapsed: boolean;
	color: string | null;
	createdAt: Date;
	/** Null (or absent) = legacy folder that owns members via `sectionId`. */
	tag?: string | null;
}

/**
 * The host-workspace shape this module reads. `tags` is optional because a
 * row served by an older host (or restored from an old snapshot) carries the
 * field absent.
 */
export interface TagFolderWorkspaceInput {
	id: string;
	/** Null for project-less "session" workspaces — never groupable. */
	projectId: string | null;
	tags?: readonly string[] | null;
}

/** One tag folder's host-side presentation (workspace_tag_settings). */
export interface TagFolderSettingInput {
	projectId: string;
	tag: string;
	displayName?: string | null;
	color?: string | null;
	tabOrder?: number | null;
}

/**
 * Cross-cutting presentation context for the union: host-side settings
 * (display name, color, order that follow the user across devices) and the
 * per-project hidden-tag list (a hidden folder leaves the union entirely —
 * members render top-level — without touching anyone's tags). REQUIRED so
 * every membership pass applies the same view; two passes disagreeing on
 * hidden is the same bug class as two membership derivations.
 */
export interface TagFolderContext {
	tagSettings: readonly TagFolderSettingInput[];
	hiddenTagsByProject: ReadonlyMap<string, ReadonlySet<string>>;
}

export const EMPTY_TAG_FOLDER_CONTEXT: TagFolderContext = {
	tagSettings: [],
	hiddenTagsByProject: new Map(),
};

export interface TagFolderSection extends TagFolderSectionInput {
	tag: string | null;
	/** True when no stored presentation row exists — the tag alone made it. */
	isDerived: boolean;
}

/** `${projectId}:${tag}` — addressable without a stored row; the tag is
 * recoverable from the key alone. `tag` must already be normalized. */
export function buildSidebarFolderKey(projectId: string, tag: string): string {
	return `${projectId}:${tag}`;
}

/**
 * Inverse of {@link buildSidebarFolderKey}. Returns null for legacy uuid
 * section ids (no colon), null/undefined input, and keys whose tag half
 * doesn't normalize to a valid tag. Project ids are uuids and never contain
 * a colon, so the first colon is the split point (tags may contain colons).
 */
export function parseSidebarFolderKey(
	sectionId: string | null | undefined,
): { projectId: string; tag: string } | null {
	if (sectionId == null) return null;
	const separatorIndex = sectionId.indexOf(":");
	if (separatorIndex <= 0) return null;
	const projectId = sectionId.slice(0, separatorIndex);
	const tag = normalizeWorkspaceTag(sectionId.slice(separatorIndex + 1));
	if (tag == null) return null;
	return { projectId, tag };
}

/**
 * Union of stored presentation rows and tag-only folders. A folder exists
 * for every (project, tag) some workspace carries; a stored row only adds
 * presentation. Derived folders are appended per project in tag order at
 * {@link DERIVED_TAG_FOLDER_TAB_ORDER_BASE}.
 */
export function deriveTagFolders(
	sections: readonly TagFolderSectionInput[],
	workspaces: readonly TagFolderWorkspaceInput[],
	context: TagFolderContext,
): TagFolderSection[] {
	const settingsByKey = new Map<string, TagFolderSettingInput>();
	for (const setting of context.tagSettings) {
		const tag = normalizeWorkspaceTag(setting.tag);
		if (tag == null) continue;
		settingsByKey.set(`${setting.projectId}\u0000${tag}`, setting);
	}
	// Host settings win over the local row for what they define — they are
	// the cross-device authority; the local row keeps only what the host
	// doesn't know (isCollapsed, and legacy fields until customised).
	const applySettings = (folder: TagFolderSection): TagFolderSection => {
		if (folder.tag == null) return folder;
		const setting = settingsByKey.get(`${folder.projectId}\u0000${folder.tag}`);
		if (!setting) return folder;
		return {
			...folder,
			name: setting.displayName ?? folder.name,
			color: setting.color ?? folder.color,
			tabOrder: setting.tabOrder ?? folder.tabOrder,
		};
	};
	const isHidden = (folder: TagFolderSection): boolean =>
		folder.tag != null &&
		(context.hiddenTagsByProject.get(folder.projectId)?.has(folder.tag) ??
			false);

	const result: TagFolderSection[] = sections.map((section) => ({
		...section,
		tag: normalizeWorkspaceTag(section.tag),
		isDerived: false,
	}));

	// Tags already covered by a stored row, per project.
	const coveredTagsByProjectId = new Map<string, Set<string>>();
	for (const section of result) {
		if (section.tag == null) continue;
		let covered = coveredTagsByProjectId.get(section.projectId);
		if (!covered) {
			covered = new Set();
			coveredTagsByProjectId.set(section.projectId, covered);
		}
		covered.add(section.tag);
	}

	const uncoveredTagsByProjectId = new Map<string, Set<string>>();
	for (const workspace of workspaces) {
		if (workspace.projectId == null) continue;
		for (const tag of normalizeWorkspaceTags(workspace.tags)) {
			if (coveredTagsByProjectId.get(workspace.projectId)?.has(tag)) continue;
			let uncovered = uncoveredTagsByProjectId.get(workspace.projectId);
			if (!uncovered) {
				uncovered = new Set();
				uncoveredTagsByProjectId.set(workspace.projectId, uncovered);
			}
			uncovered.add(tag);
		}
	}

	for (const [projectId, tags] of uncoveredTagsByProjectId) {
		[...tags].sort().forEach((tag, index) => {
			result.push({
				sectionId: buildSidebarFolderKey(projectId, tag),
				projectId,
				name: tag,
				tag,
				tabOrder: DERIVED_TAG_FOLDER_TAB_ORDER_BASE + index,
				isCollapsed: false,
				color: null,
				createdAt: new Date(0),
				isDerived: true,
			});
		});
	}

	return result.map(applySettings).filter((folder) => !isHidden(folder));
}

/**
 * tag → folder for one project, over the derived union from
 * {@link deriveTagFolders} (stored-only input misses tag-only folders).
 * Duplicate tags keep the lowest tabOrder.
 */
export function getProjectFolderTagIndex(
	sections: readonly Pick<
		TagFolderSectionInput,
		"sectionId" | "projectId" | "tabOrder" | "tag"
	>[],
	projectId: string,
): Map<string, TagFolderRef> {
	const index = new Map<string, TagFolderRef>();
	for (const section of sections) {
		if (section.projectId !== projectId) continue;
		const tag = normalizeWorkspaceTag(section.tag);
		if (tag == null) continue;
		const existing = index.get(tag);
		if (existing && existing.tabOrder <= section.tabOrder) continue;
		index.set(tag, {
			sectionId: section.sectionId,
			projectId: section.projectId,
			tag,
			tabOrder: section.tabOrder,
		});
	}
	return index;
}

/**
 * The one container a workspace's tags place it in, or null. A workspace
 * renders in exactly one container — ordering, DnD, selection and keyboard
 * nav all assume it — so ties resolve to the lowest tabOrder, then the
 * lexicographically smallest tag.
 */
export function resolveWorkspaceFolder(
	tags: readonly string[] | null | undefined,
	index: ReadonlyMap<string, TagFolderRef>,
): TagFolderRef | null {
	let winner: TagFolderRef | null = null;
	for (const tag of normalizeWorkspaceTags(tags)) {
		const ref = index.get(tag);
		if (!ref) continue;
		if (
			!winner ||
			ref.tabOrder < winner.tabOrder ||
			(ref.tabOrder === winner.tabOrder && ref.tag < winner.tag)
		) {
			winner = ref;
		}
	}
	return winner;
}

/**
 * The shared membership resolver: tag-resolved folder first; otherwise the
 * local `sectionId` — but only when it points at a legacy (non-tag-keyed)
 * row. A tag-backed folder owns membership via tags alone, so a stale local
 * pointer at one must never capture the workspace (§6 of the design doc:
 * migration only sets a tag after every member is tagged, so a live tag
 * always beats a stale pointer).
 */
export function resolveWorkspaceSectionId(args: {
	tags: readonly string[] | null | undefined;
	localSectionId: string | null | undefined;
	index: ReadonlyMap<string, TagFolderRef>;
}): string | null {
	const folder = resolveWorkspaceFolder(args.tags, args.index);
	if (folder) return folder.sectionId;
	if (args.localSectionId == null) return null;
	if (parseSidebarFolderKey(args.localSectionId) != null) return null;
	return args.localSectionId;
}

/**
 * Mint a tag for a folder from its display name: normalize (trim+lowercase —
 * tags allow spaces, no further slugging), fall back to "group" for a name
 * that can't be a tag, and suffix `-2`, `-3`, … while the tag is taken.
 */
export function mintFolderTag(
	name: string | null | undefined,
	takenTags: Iterable<string>,
): string {
	const taken = new Set<string>();
	for (const tag of takenTags) {
		const normalized = normalizeWorkspaceTag(tag);
		if (normalized != null) taken.add(normalized);
	}
	const base = normalizeWorkspaceTag(name) ?? "group";
	if (!taken.has(base)) return base;
	let counter = 2;
	for (;;) {
		const suffix = `-${counter}`;
		// Trim the base so the suffixed tag stays within the length cap —
		// the host rejects (never trims) over-length tags.
		const candidate =
			base.slice(0, WORKSPACE_TAG_MAX_LENGTH - suffix.length).trimEnd() +
			suffix;
		if (!taken.has(candidate)) return candidate;
		counter += 1;
	}
}

/**
 * Retarget a workspace's tags from one folder to another, touching ONLY tags
 * the project has a folder for. `folderTags` is the project's folder tag set
 * (the keys of {@link getProjectFolderTagIndex}); anything outside it — an
 * agent's `--tag scratch` in a project with no scratch folder — survives.
 * `nextTag` null strips folder membership (ungroup).
 */
export function applyFolderTagChange(
	currentTags: readonly string[] | null | undefined,
	folderTags: Iterable<string>,
	nextTag: string | null,
): string[] {
	const folderTagSet = new Set<string>();
	for (const tag of folderTags) {
		const normalized = normalizeWorkspaceTag(tag);
		if (normalized != null) folderTagSet.add(normalized);
	}
	const kept = normalizeWorkspaceTags(currentTags).filter(
		(tag) => !folderTagSet.has(tag),
	);
	const next = normalizeWorkspaceTag(nextTag);
	if (next != null) kept.push(next);
	return normalizeWorkspaceTags(kept);
}
