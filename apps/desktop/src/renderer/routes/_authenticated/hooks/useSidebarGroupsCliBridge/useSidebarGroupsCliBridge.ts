import type { SidebarGroupsCliOperation } from "@superset/shared/sidebar-groups-cli";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	getNextTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { PROJECT_CUSTOM_COLORS } from "shared/constants/project-colors";
import { createEmptyPaneLayout } from "../useDashboardSidebarState/sidebarMutations";
import {
	ensureSidebarProjectRecord,
	getFirstSectionIndex,
	getProjectTopLevelItems,
	writeProjectTopLevelOrder,
} from "../useDashboardSidebarState/useDashboardSidebarState";

type BridgeCollections = Pick<
	AppCollections,
	| "v2SidebarProjects"
	| "v2SidebarSections"
	| "v2WorkspaceLocalState"
	| "v2Workspaces"
>;

type SidebarSectionSnapshot = {
	id: string;
	projectId: string;
	name: string;
	createdAt: Date;
	tabOrder: number;
	isCollapsed: boolean;
	color: string | null;
};

type SidebarWorkspaceSnapshot = {
	id: string;
	projectId: string;
	name: string;
	branch: string | null;
	sectionId: string | null;
	tabOrder: number;
};

function randomSectionColor(): string {
	return PROJECT_CUSTOM_COLORS[
		Math.floor(Math.random() * PROJECT_CUSTOM_COLORS.length)
	].value;
}

function ensureWorkspaceLocalState(
	collections: BridgeCollections,
	workspaceId: string,
	projectId: string,
): void {
	const existing = collections.v2WorkspaceLocalState.get(workspaceId);
	if (existing && isSidebarWorkspaceVisible(existing)) return;

	const topLevelItems = getProjectTopLevelItems(collections, projectId, {
		excludeWorkspaceId: workspaceId,
	});

	if (existing) {
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.sidebarState.projectId = projectId;
			draft.sidebarState.sectionId = null;
			draft.sidebarState.tabOrder = getNextTabOrder(topLevelItems);
			draft.sidebarState.isHidden = false;
		});
		return;
	}

	collections.v2WorkspaceLocalState.insert({
		workspaceId,
		createdAt: new Date(),
		sidebarState: {
			projectId,
			tabOrder: getNextTabOrder(topLevelItems),
			sectionId: null,
			isHidden: false,
		},
		paneLayout: createEmptyPaneLayout(),
	});
}

function moveWorkspaceToSection(
	collections: BridgeCollections,
	workspaceId: string,
	sectionId: string | null,
): boolean {
	const workspace = collections.v2Workspaces.get(workspaceId);
	const projectId = sectionId
		? collections.v2SidebarSections.get(sectionId)?.projectId
		: (collections.v2WorkspaceLocalState.get(workspaceId)?.sidebarState
				.projectId ?? workspace?.projectId);
	if (!projectId) return false;
	ensureWorkspaceLocalState(collections, workspaceId, projectId);

	if (sectionId === null) {
		const topLevelItems = getProjectTopLevelItems(collections, projectId, {
			excludeWorkspaceId: workspaceId,
		});
		const insertIndex = getFirstSectionIndex(topLevelItems);
		topLevelItems.splice(insertIndex, 0, {
			type: "workspace",
			id: workspaceId,
			tabOrder: 0,
		});
		writeProjectTopLevelOrder(collections, projectId, topLevelItems);
		return true;
	}

	const siblingRows = Array.from(
		collections.v2WorkspaceLocalState.state.values(),
	)
		.filter(
			(item) =>
				item.sidebarState.projectId === projectId &&
				isSidebarWorkspaceVisible(item) &&
				item.workspaceId !== workspaceId &&
				item.sidebarState.sectionId === sectionId,
		)
		.map((item) => ({ tabOrder: item.sidebarState.tabOrder }));

	collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
		draft.sidebarState.projectId = projectId;
		draft.sidebarState.sectionId = sectionId;
		draft.sidebarState.tabOrder = getNextTabOrder(siblingRows);
		draft.sidebarState.isHidden = false;
	});
	return true;
}

function createSectionFromOperation(
	collections: BridgeCollections,
	operation: Extract<SidebarGroupsCliOperation, { type: "createSection" }>,
): boolean {
	if (!collections.v2SidebarSections.get(operation.sectionId)) {
		ensureSidebarProjectRecord(collections, operation.projectId);
		collections.v2SidebarSections.insert({
			sectionId: operation.sectionId,
			projectId: operation.projectId,
			name: operation.name,
			createdAt: new Date(operation.createdAt),
			tabOrder: getNextTabOrder(
				getProjectTopLevelItems(collections, operation.projectId),
			),
			isCollapsed: false,
			color: randomSectionColor(),
		});
	}

	for (const workspaceId of operation.workspaceIds) {
		if (
			!moveWorkspaceToSection(collections, workspaceId, operation.sectionId)
		) {
			return false;
		}
	}
	return true;
}

function deleteSection(
	collections: BridgeCollections,
	sectionId: string,
): boolean {
	const section = collections.v2SidebarSections.get(sectionId);
	if (!section) return true;

	const topLevelItems = getProjectTopLevelItems(
		collections,
		section.projectId,
		{
			excludeSectionId: sectionId,
		},
	);
	const sectionWorkspaces = Array.from(
		collections.v2WorkspaceLocalState.state.values(),
	)
		.filter(
			(item) =>
				item.sidebarState.projectId === section.projectId &&
				isSidebarWorkspaceVisible(item) &&
				item.sidebarState.sectionId === sectionId,
		)
		.sort(
			(left, right) => left.sidebarState.tabOrder - right.sidebarState.tabOrder,
		);

	topLevelItems.splice(
		getFirstSectionIndex(topLevelItems),
		0,
		...sectionWorkspaces.map((workspace) => ({
			type: "workspace" as const,
			id: workspace.workspaceId,
			tabOrder: 0,
		})),
	);
	writeProjectTopLevelOrder(collections, section.projectId, topLevelItems);
	collections.v2SidebarSections.delete(sectionId);
	return true;
}

function applyOperation(
	collections: BridgeCollections,
	operation: SidebarGroupsCliOperation,
): boolean {
	switch (operation.type) {
		case "createSection":
			return createSectionFromOperation(collections, operation);
		case "renameSection":
			if (!collections.v2SidebarSections.get(operation.sectionId)) {
				return false;
			}
			collections.v2SidebarSections.update(operation.sectionId, (draft) => {
				draft.name = operation.name.trim();
			});
			return true;
		case "deleteSection":
			return deleteSection(collections, operation.sectionId);
		case "moveWorkspaces":
			for (const workspaceId of operation.workspaceIds) {
				if (
					!moveWorkspaceToSection(collections, workspaceId, operation.sectionId)
				) {
					return false;
				}
			}
			return true;
	}
}

export function useSidebarGroupsCliBridge(args: {
	activeOrganizationId: string | null;
	isReady: boolean;
	collections: BridgeCollections;
	sections: SidebarSectionSnapshot[];
	workspaces: SidebarWorkspaceSnapshot[];
}): void {
	const { mutateAsync: writeSnapshot } =
		electronTrpc.sidebarGroupsCli.writeSnapshot.useMutation();
	const { mutateAsync: readOperation } =
		electronTrpc.sidebarGroupsCli.readOperation.useMutation();
	const { mutateAsync: ackOperation } =
		electronTrpc.sidebarGroupsCli.ackOperation.useMutation();
	const { mutateAsync: releaseOperation } =
		electronTrpc.sidebarGroupsCli.releaseOperation.useMutation();
	const pendingAckRef = useRef<{
		organizationId: string;
		operationId: string;
	} | null>(null);

	const snapshot = useMemo(
		() => ({
			updatedAt: new Date().toISOString(),
			sections: args.sections.map((section) => ({
				id: section.id,
				projectId: section.projectId,
				name: section.name,
				createdAt: section.createdAt.toISOString(),
				tabOrder: section.tabOrder,
				isCollapsed: section.isCollapsed,
				color: section.color,
			})),
			workspaces: args.workspaces.map((workspace) => ({
				id: workspace.id,
				projectId: workspace.projectId,
				name: workspace.name,
				branch: workspace.branch,
				sectionId: workspace.sectionId,
				tabOrder: workspace.tabOrder,
			})),
		}),
		[args.sections, args.workspaces],
	);

	useEffect(() => {
		if (!args.activeOrganizationId || !args.isReady) return;
		const organizationId = args.activeOrganizationId;
		let cancelled = false;
		let retryId: number | undefined;

		const persistSnapshot = async () => {
			const result = await writeSnapshot({
				organizationId,
				snapshot,
			});
			if (!cancelled && !result.success) {
				retryId = window.setTimeout(() => void persistSnapshot(), 1_000);
			}
		};

		void persistSnapshot();
		return () => {
			cancelled = true;
			if (retryId !== undefined) window.clearTimeout(retryId);
		};
	}, [args.activeOrganizationId, args.isReady, snapshot, writeSnapshot]);

	const applyPendingOperations = useCallback(async () => {
		if (!args.activeOrganizationId || !args.isReady) return;
		try {
			const organizationId = args.activeOrganizationId;
			if (pendingAckRef.current) {
				if (pendingAckRef.current.organizationId !== organizationId) {
					pendingAckRef.current = null;
				} else {
					const ackResult = await ackOperation({
						organizationId,
						operationId: pendingAckRef.current.operationId,
					});
					if (!ackResult.success) return;
					pendingAckRef.current = null;
				}
			}

			for (let appliedCount = 0; appliedCount < 50; appliedCount += 1) {
				const result = await readOperation({ organizationId });
				if (!result.operation) return;

				let applied = false;
				try {
					applied = applyOperation(args.collections, result.operation);
				} catch (error) {
					await releaseOperation({
						organizationId,
						operationId: result.operation.id,
					});
					throw error;
				}

				if (!applied) {
					await releaseOperation({
						organizationId,
						operationId: result.operation.id,
					});
					return;
				}

				pendingAckRef.current = {
					organizationId,
					operationId: result.operation.id,
				};
				const ackResult = await ackOperation({
					organizationId,
					operationId: result.operation.id,
				});
				if (!ackResult.success) return;
				pendingAckRef.current = null;
			}
		} catch (error) {
			console.error("Failed to apply sidebar groups CLI operation", error);
		}
	}, [
		ackOperation,
		args.activeOrganizationId,
		args.collections,
		args.isReady,
		readOperation,
		releaseOperation,
	]);

	useEffect(() => {
		void applyPendingOperations();
		const intervalId = window.setInterval(() => {
			void applyPendingOperations();
		}, 1_000);
		return () => window.clearInterval(intervalId);
	}, [applyPendingOperations]);
}
