import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface CloudSidebarGroup {
	id: string;
	name: string;
	createdAt: number;
	isCollapsed: boolean;
}

export interface CloudSidebarEntry {
	/** Unset: in the sidebar exactly when you created the box. */
	inSidebar?: boolean;
	groupId?: string;
	lastReadAt?: number;
}

export interface CloudSidebarOrgState {
	entries: Record<string, CloudSidebarEntry>;
	groups: CloudSidebarGroup[];
}

export const EMPTY_CLOUD_SIDEBAR: CloudSidebarOrgState = {
	entries: {},
	groups: [],
};

interface CloudSidebarState {
	byOrganization: Record<string, CloudSidebarOrgState>;
	setInSidebar: (
		organizationId: string,
		workspaceId: string,
		inSidebar: boolean,
	) => void;
	moveToGroup: (
		organizationId: string,
		workspaceId: string,
		groupId: string | null,
	) => void;
	createGroup: (organizationId: string, name: string) => string;
	renameGroup: (organizationId: string, groupId: string, name: string) => void;
	deleteGroup: (organizationId: string, groupId: string) => void;
	toggleGroupCollapsed: (organizationId: string, groupId: string) => void;
	/** `notifiedAt` guards against the sandbox's clock running ahead of this one. */
	markRead: (
		organizationId: string,
		workspaceId: string,
		notifiedAt: number | null,
	) => void;
	markUnread: (organizationId: string, workspaceId: string) => void;
	pruneEntries: (organizationId: string, liveWorkspaceIds: Set<string>) => void;
}

const CLOUD_SIDEBAR_STORAGE_KEY = "cloud-sidebar";

export const useCloudSidebarStore = create<CloudSidebarState>()(
	devtools(
		persist(
			(set, get) => {
				const updateOrg = (
					organizationId: string,
					update: (org: CloudSidebarOrgState) => CloudSidebarOrgState,
				) =>
					set((state) => ({
						byOrganization: {
							...state.byOrganization,
							[organizationId]: update(
								state.byOrganization[organizationId] ?? EMPTY_CLOUD_SIDEBAR,
							),
						},
					}));
				const updateEntry = (
					organizationId: string,
					workspaceId: string,
					patch: Partial<CloudSidebarEntry>,
				) =>
					updateOrg(organizationId, (org) => ({
						...org,
						entries: {
							...org.entries,
							[workspaceId]: { ...org.entries[workspaceId], ...patch },
						},
					}));

				return {
					byOrganization: {},
					setInSidebar: (organizationId, workspaceId, inSidebar) =>
						updateEntry(organizationId, workspaceId, { inSidebar }),
					moveToGroup: (organizationId, workspaceId, groupId) =>
						updateEntry(organizationId, workspaceId, {
							groupId: groupId ?? undefined,
						}),
					createGroup: (organizationId, name) => {
						const id = crypto.randomUUID();
						updateOrg(organizationId, (org) => ({
							...org,
							groups: [
								...org.groups,
								{ id, name, createdAt: Date.now(), isCollapsed: false },
							],
						}));
						return id;
					},
					renameGroup: (organizationId, groupId, name) =>
						updateOrg(organizationId, (org) => ({
							...org,
							groups: org.groups.map((group) =>
								group.id === groupId ? { ...group, name } : group,
							),
						})),
					deleteGroup: (organizationId, groupId) =>
						updateOrg(organizationId, (org) => ({
							entries: Object.fromEntries(
								Object.entries(org.entries).map(([workspaceId, entry]) => [
									workspaceId,
									entry.groupId === groupId
										? { ...entry, groupId: undefined }
										: entry,
								]),
							),
							groups: org.groups.filter((group) => group.id !== groupId),
						})),
					toggleGroupCollapsed: (organizationId, groupId) =>
						updateOrg(organizationId, (org) => ({
							...org,
							groups: org.groups.map((group) =>
								group.id === groupId
									? { ...group, isCollapsed: !group.isCollapsed }
									: group,
							),
						})),
					markRead: (organizationId, workspaceId, notifiedAt) =>
						updateEntry(organizationId, workspaceId, {
							lastReadAt: Math.max(Date.now(), notifiedAt ?? 0),
						}),
					markUnread: (organizationId, workspaceId) =>
						updateEntry(organizationId, workspaceId, { lastReadAt: 0 }),
					pruneEntries: (organizationId, liveWorkspaceIds) => {
						const org = get().byOrganization[organizationId];
						if (!org) return;
						const stale = Object.keys(org.entries).filter(
							(workspaceId) => !liveWorkspaceIds.has(workspaceId),
						);
						if (stale.length === 0) return;
						updateOrg(organizationId, (current) => ({
							...current,
							entries: Object.fromEntries(
								Object.entries(current.entries).filter(([workspaceId]) =>
									liveWorkspaceIds.has(workspaceId),
								),
							),
						}));
					},
				};
			},
			{ name: CLOUD_SIDEBAR_STORAGE_KEY, version: 1 },
		),
	),
);
