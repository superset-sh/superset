/**
 * v1 → v2 sidebar order translation.
 *
 * v1 allowed arbitrary interleaving of top-level workspaces and sections.
 * v2 doesn't — if a top-level workspace appears after a section in sort
 * order, v2's render absorbs it into that section's display group
 * (useDashboardSidebarData.ts:343-357). A direct copy of v1 tab_order
 * values would surprise users whose v1 layout had post-section orphans.
 *
 * Translation: put all top-level workspaces first (in their original
 * v1 order), then sections (in their original v1 order). Preserves
 * relative ordering within each group; sacrifices interleaving (which
 * v2 can't express anyway). Workspaces inside a section keep their
 * within-section order.
 */
export interface V1TabOrderInput {
	workspaces: Array<{
		id: string;
		projectId: string;
		sectionId: string | null;
		tabOrder: number;
	}>;
	sections: Array<{ id: string; projectId: string; tabOrder: number }>;
}

export interface V1TabOrderOutput {
	workspaceTabOrder: Map<string, number>;
	sectionTabOrder: Map<string, number>;
}

export function computeNormalizedOrders(
	input: V1TabOrderInput,
): V1TabOrderOutput {
	const workspaceTabOrder = new Map<string, number>();
	const sectionTabOrder = new Map<string, number>();

	const projectIds = new Set<string>();
	for (const w of input.workspaces) projectIds.add(w.projectId);
	for (const s of input.sections) projectIds.add(s.projectId);

	for (const projectId of projectIds) {
		const topLevelWorkspaces = input.workspaces
			.filter((w) => w.projectId === projectId && w.sectionId === null)
			.sort((a, b) => a.tabOrder - b.tabOrder);

		const sections = input.sections
			.filter((s) => s.projectId === projectId)
			.sort((a, b) => a.tabOrder - b.tabOrder);

		topLevelWorkspaces.forEach((w, index) => {
			workspaceTabOrder.set(w.id, index);
		});

		sections.forEach((s, index) => {
			sectionTabOrder.set(s.id, topLevelWorkspaces.length + index);
		});

		// Workspaces inside sections: keep order relative to their section peers.
		const workspacesBySection = new Map<
			string,
			Array<(typeof input.workspaces)[number]>
		>();
		for (const w of input.workspaces) {
			if (w.projectId !== projectId || w.sectionId === null) continue;
			const group = workspacesBySection.get(w.sectionId) ?? [];
			group.push(w);
			workspacesBySection.set(w.sectionId, group);
		}
		for (const [, group] of workspacesBySection) {
			group
				.sort((a, b) => a.tabOrder - b.tabOrder)
				.forEach((w, index) => {
					workspaceTabOrder.set(w.id, index);
				});
		}
	}

	return { workspaceTabOrder, sectionTabOrder };
}
