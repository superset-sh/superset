/**
 * Plans the conversion of manual sections into tag-bound ("smart") sections:
 * each section gets a tag derived from its name, every explicit member is
 * tagged host-side, and membership becomes derived. Pure so the same plan
 * can back a per-section "Convert to smart group" action or a bulk migration.
 *
 * Execution order matters for a seamless switch: write the members' tags
 * first (explicit sectionId still holds them in place), then set the
 * section's tagBinding, then clear the members' sectionId — at no point
 * does a member visually leave its group.
 *
 * One deliberate consequence of merging (never replacing) tags: a member
 * that already carries a tag bound by an earlier-ordered smart section
 * lands there after migration, per the multi-tag lowest-tab-order rule —
 * membership becomes honest to the model rather than to the old manual
 * placement. A migration UI should surface those members before running.
 */

export interface SectionForTagMigration {
	id: string;
	projectId: string;
	name: string;
	tagBinding: string | null;
}

export interface WorkspaceForTagMigration {
	id: string;
	sectionId: string | null;
	tags: string[];
}

export interface SectionTagMigrationStep {
	sectionId: string;
	projectId: string;
	tag: string;
	/** Explicit members: tag each host-side, then clear its sectionId. */
	members: Array<{ workspaceId: string; nextTags: string[] }>;
}

/**
 * Section name → tag in the host's normalized form, made CLI-ergonomic:
 * spaces/underscores collapse to hyphens and anything outside [a-z0-9-]
 * drops, so "Test Fleet" becomes `test-fleet` (typeable as `--tag test-fleet`).
 */
export function deriveTagFromSectionName(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 64);
	return slug || "group";
}

export function planSectionTagMigrations(args: {
	sections: SectionForTagMigration[];
	/** Every local-state row with a sectionId — including hidden rows, so
	 * they stay grouped when unhidden. */
	workspaces: WorkspaceForTagMigration[];
}): SectionTagMigrationStep[] {
	// Uniqueness is per project: bindings already in use plus tags this plan
	// is about to claim. Two sections named "Backend" in one project become
	// backend and backend-2 rather than silently merging their membership.
	const claimedByProject = new Map<string, Set<string>>();
	for (const section of args.sections) {
		if (!section.tagBinding) continue;
		const claimed = claimedByProject.get(section.projectId) ?? new Set();
		claimed.add(section.tagBinding);
		claimedByProject.set(section.projectId, claimed);
	}

	const membersBySectionId = new Map<string, WorkspaceForTagMigration[]>();
	for (const workspace of args.workspaces) {
		if (!workspace.sectionId) continue;
		const members = membersBySectionId.get(workspace.sectionId) ?? [];
		members.push(workspace);
		membersBySectionId.set(workspace.sectionId, members);
	}

	const steps: SectionTagMigrationStep[] = [];
	for (const section of args.sections) {
		// Already smart — nothing to migrate; rerunning the plan is a no-op
		// for it, which is what makes the migration idempotent.
		if (section.tagBinding) continue;

		const claimed = claimedByProject.get(section.projectId) ?? new Set();
		claimedByProject.set(section.projectId, claimed);
		const base = deriveTagFromSectionName(section.name);
		let tag = base;
		for (let suffix = 2; claimed.has(tag); suffix++) {
			tag = `${base.slice(0, 60)}-${suffix}`;
		}
		claimed.add(tag);

		steps.push({
			sectionId: section.id,
			projectId: section.projectId,
			tag,
			members: (membersBySectionId.get(section.id) ?? []).map((workspace) => ({
				workspaceId: workspace.id,
				// Merge, never replace: a member keeps the tags it already has.
				nextTags: workspace.tags.includes(tag)
					? workspace.tags
					: [...workspace.tags, tag].sort(),
			})),
		});
	}
	return steps;
}
