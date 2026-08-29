import {
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
} from "@superset/shared/workspace-tags";
import {
	buildSidebarFolderKey,
	mintFolderTag,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";

/**
 * In-place conversion of legacy folders (uuid-keyed rows whose membership
 * lives in local `sectionId` pointers) into tag-backed folders. §6 of
 * plans/20260828-workspace-tags-design.md:
 *
 * - `tag === null` IS the "not converted" marker — no migration flag, so the
 *   pass is idempotent, resumable, and self-clearing.
 * - Members are the folder's VISIBLE pointer rows; hidden tombstones are
 *   never resurrected.
 * - Every member must land on its host before the row swap. Unreachable
 *   host → the folder stays legacy and retries next run; a rejected write
 *   parks the folder for the session so a permanently failing host isn't
 *   hammered on every workspace-cache change.
 * - Only then: insert the tag-keyed row, delete the legacy row, clear the
 *   members' pointers.
 */

export interface MigrationSectionRow {
	sectionId: string;
	projectId: string;
	name: string;
	tag?: string | null;
	color: string | null;
	tabOrder: number;
	isCollapsed: boolean;
	createdAt: Date;
}

export interface MigrationLocalRow {
	workspaceId: string;
	sectionId: string | null;
	isVisible: boolean;
}

export interface MigrationHostRow {
	id: string;
	projectId: string | null;
	tags?: readonly string[] | null;
	/** False when the host didn't answer or has no resolvable URL right now. */
	hostReachable: boolean;
}

export interface LegacyFolderMigrationIo {
	sections: readonly MigrationSectionRow[];
	localRows: readonly MigrationLocalRow[];
	hostRowsById: ReadonlyMap<string, MigrationHostRow>;
	/** Host write; throwing parks the folder for the session. */
	writeTags(workspaceId: string, tags: string[]): Promise<void>;
	insertSection(row: MigrationSectionRow & { tag: string }): void;
	deleteSection(sectionId: string): void;
	/** Clear the pointer only if it still targets the legacy row. */
	clearLocalSectionId(workspaceId: string, legacySectionId: string): void;
}

export interface LegacyFolderMigrationResult {
	converted: string[];
	parked: string[];
	deferred: string[];
}

export async function migrateLegacySidebarFolders(
	io: LegacyFolderMigrationIo,
	sessionParked: Set<string>,
): Promise<LegacyFolderMigrationResult> {
	const result: LegacyFolderMigrationResult = {
		converted: [],
		parked: [],
		deferred: [],
	};

	// Tags owned by a stored row, plus tags minted earlier in this run —
	// reserved unconditionally so two legacy folders can't mint the same tag.
	const storedTagsByProject = new Map<string, Set<string>>();
	const reserveStored = (projectId: string, tag: string) => {
		let taken = storedTagsByProject.get(projectId);
		if (!taken) {
			taken = new Set();
			storedTagsByProject.set(projectId, taken);
		}
		taken.add(tag);
	};
	for (const section of io.sections) {
		const tag = normalizeWorkspaceTag(section.tag);
		if (tag == null) continue;
		reserveStored(section.projectId, tag);
	}

	for (const section of io.sections) {
		if (normalizeWorkspaceTag(section.tag) != null) continue; // converted
		if (sessionParked.has(section.sectionId)) continue;

		// A pointer whose workspace no host serves any more is a stale row
		// (deleted workspace) — it must not hold the folder legacy forever.
		// The caller only runs this pass once the host fan-out is ready, so
		// "no row anywhere" means gone, not "not yet answered".
		const members = io.localRows.filter(
			(row) =>
				row.sectionId === section.sectionId &&
				row.isVisible &&
				io.hostRowsById.has(row.workspaceId),
		);
		const memberHostRows = members.map((member) =>
			io.hostRowsById.get(member.workspaceId),
		);
		if (memberHostRows.some((hostRow) => !hostRow?.hostReachable)) {
			// A member's host is offline — leave the whole folder legacy; the
			// pass re-runs on every workspace-cache change.
			result.deferred.push(section.sectionId);
			continue;
		}

		// Derived folders count as taken too — but only through tags carried
		// by NON-members. A tag carried solely by this folder's own members is
		// a previous partial run of this very conversion, and reusing it is
		// what makes the retry converge instead of minting -2 forever.
		const memberIds = new Set(members.map((member) => member.workspaceId));
		const taken = new Set(storedTagsByProject.get(section.projectId) ?? []);
		for (const hostRow of io.hostRowsById.values()) {
			if (hostRow.projectId !== section.projectId) continue;
			if (memberIds.has(hostRow.id)) continue;
			for (const workspaceTag of normalizeWorkspaceTags(hostRow.tags)) {
				taken.add(workspaceTag);
			}
		}
		const tag = mintFolderTag(section.name, taken);
		reserveStored(section.projectId, tag);

		let rejected = false;
		for (const hostRow of memberHostRows) {
			if (!hostRow) continue;
			const tags = normalizeWorkspaceTags(hostRow.tags);
			if (tags.includes(tag)) continue;
			try {
				await io.writeTags(hostRow.id, normalizeWorkspaceTags([...tags, tag]));
			} catch {
				rejected = true;
				break;
			}
		}
		if (rejected) {
			sessionParked.add(section.sectionId);
			result.parked.push(section.sectionId);
			continue;
		}

		// Every member landed — swap the row and clear the pointers.
		const newSectionId = buildSidebarFolderKey(section.projectId, tag);
		io.insertSection({
			sectionId: newSectionId,
			projectId: section.projectId,
			name: section.name,
			tag,
			color: section.color,
			tabOrder: section.tabOrder,
			isCollapsed: section.isCollapsed,
			createdAt: section.createdAt,
		});
		io.deleteSection(section.sectionId);
		for (const member of members) {
			io.clearLocalSectionId(member.workspaceId, section.sectionId);
		}
		result.converted.push(section.sectionId);
	}

	return result;
}
