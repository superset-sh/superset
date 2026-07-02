import { CLIError } from "@superset/cli-framework";
import {
	mutateSidebarGroupsCliState,
	readSidebarGroupsCliState,
	type SidebarGroupsCliOperation,
	type SidebarGroupsCliSection,
	type SidebarGroupsCliSnapshot,
	type SidebarGroupsCliState,
} from "@superset/shared/sidebar-groups-cli";
import { SUPERSET_HOME_DIR } from "./config";

export type SidebarGroupRow = SidebarGroupsCliSection & {
	workspaceCount: number;
	workspaces: string;
	pendingOperations: number;
};

export function requireOrganizationId(
	organizationId: string | undefined,
): string {
	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	return organizationId;
}

export function readSidebarState(
	organizationId: string,
): SidebarGroupsCliState {
	return readSidebarGroupsCliState({
		homeDir: SUPERSET_HOME_DIR,
		organizationId,
	});
}

export function requireSnapshot(
	state: SidebarGroupsCliState,
): SidebarGroupsCliSnapshot {
	if (!state.snapshot) {
		throw new CLIError(
			"No desktop sidebar snapshot is available for this organization",
			"Open the Superset desktop app once, then rerun this command.",
		);
	}
	return state.snapshot;
}

export function queueSidebarOperationWithSnapshotUpdate<TData>(
	organizationId: string,
	update: (snapshot: SidebarGroupsCliSnapshot) => {
		data: TData;
		operation: SidebarGroupsCliOperation;
		snapshot: SidebarGroupsCliSnapshot;
	},
): { data: TData; state: SidebarGroupsCliState } {
	let data: TData | undefined;
	const state = mutateSidebarGroupsCliState(
		{ homeDir: SUPERSET_HOME_DIR, organizationId },
		(currentState) => {
			const snapshot = requireSnapshot(currentState);
			const next = update(snapshot);
			data = next.data;
			return {
				...currentState,
				operations: [...currentState.operations, next.operation],
				snapshot: next.snapshot,
			};
		},
	);
	if (data === undefined) {
		throw new CLIError("Sidebar group update did not produce command data");
	}
	return { data, state };
}

export function toGroupRows(state: SidebarGroupsCliState): SidebarGroupRow[] {
	const snapshot = requireSnapshot(state);
	return snapshot.sections
		.map((section) => {
			const members = snapshot.workspaces
				.filter((workspace) => workspace.sectionId === section.id)
				.sort((left, right) => left.tabOrder - right.tabOrder);
			return {
				...section,
				workspaceCount: members.length,
				workspaces: members.map((workspace) => workspace.name).join(", "),
				pendingOperations: state.operations.length,
			};
		})
		.sort((left, right) => left.tabOrder - right.tabOrder);
}

export function assertSameProject(
	workspaceIds: string[],
	snapshot: SidebarGroupsCliSnapshot,
): string {
	const workspaces = workspaceIds.map((id) => {
		const workspace = snapshot.workspaces.find(
			(candidate) => candidate.id === id,
		);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found in desktop sidebar snapshot: ${id}`,
				"Open the Superset desktop app so it can refresh the local sidebar snapshot.",
			);
		}
		return workspace;
	});
	const projectIds = [
		...new Set(workspaces.map((workspace) => workspace.projectId)),
	];
	const projectId = projectIds[0];
	if (projectIds.length !== 1 || !projectId) {
		throw new CLIError(
			"Workspace groups cannot span projects",
			"Pass workspace IDs from a single project.",
		);
	}
	return projectId;
}

export function findSection(
	snapshot: SidebarGroupsCliSnapshot,
	sectionId: string,
): SidebarGroupsCliSection {
	const section = snapshot.sections.find(
		(candidate) => candidate.id === sectionId,
	);
	if (!section) {
		throw new CLIError(
			`Workspace group not found: ${sectionId}`,
			"List groups with: superset workspaces groups list",
		);
	}
	return section;
}
