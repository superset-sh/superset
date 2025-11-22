import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import { createTabsRouter } from "./tabs";

// Mock the database
const mockDb = {
	data: {
		workspaces: [
			{
				id: "workspace-1",
				projectId: "project-1",
				worktreeId: "worktree-1",
				name: "Test Workspace",
				tabOrder: 0,
				activeTabId: undefined as string | undefined,
				isActive: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				lastOpenedAt: Date.now(),
			},
		],
		tabs: [] as Array<{
			id: string;
			workspaceId: string;
			parentId?: string;
			title: string;
			type: "terminal" | "group";
			position: number;
			layout?: MosaicNode<string> | null;
			needsAttention?: boolean;
			createdAt: number;
			updatedAt: number;
		}>,
		projects: [],
		worktrees: [],
	},
	update: mock(async (fn: (data: typeof mockDb.data) => void) => {
		fn(mockDb.data);
	}),
};

// Mock the database module
mock.module("main/lib/db", () => ({
	db: mockDb,
}));

// Mock the terminal manager
const mockTerminalKill = mock(() => {});
mock.module("main/lib/terminal-manager", () => ({
	terminalManager: {
		kill: mockTerminalKill,
	},
}));

// Reset mock data before each test
beforeEach(() => {
	mockDb.data.workspaces = [
		{
			id: "workspace-1",
			projectId: "project-1",
			worktreeId: "worktree-1",
			name: "Test Workspace",
			tabOrder: 0,
			activeTabId: undefined,
			isActive: true,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			lastOpenedAt: Date.now(),
		},
	];
	mockDb.data.tabs = [];
	mockTerminalKill.mockClear();
});

describe("tabs router - create", () => {
	it("should create a terminal tab and set it as active", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const result = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		expect(result.type).toBe("terminal");
		expect(result.title).toBe("New Terminal");
		expect(result.workspaceId).toBe("workspace-1");
		expect(result.position).toBe(0);
		expect(mockDb.data.tabs).toHaveLength(1);
		expect(mockDb.data.workspaces[0].activeTabId).toBe(result.id);
	});

	it("should create a group tab", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const result = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});

		expect(result.type).toBe("group");
		expect(result.title).toBe("New Split View");
	});

	it("should assign correct position for multiple tabs", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const tab1 = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});
		const tab2 = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		expect(tab1.position).toBe(0);
		expect(tab2.position).toBe(1);
	});
});

describe("tabs router - remove", () => {
	it("should remove a terminal tab", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const tab = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		const result = await caller.remove({ id: tab.id });

		expect(result.success).toBe(true);
		expect(mockDb.data.tabs).toHaveLength(0);
		expect(mockTerminalKill).toHaveBeenCalledWith({ tabId: tab.id });
	});

	it("should remove a group and all its children", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		// Create a group with children
		const group = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});
		const child1 = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});
		const child2 = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});

		const result = await caller.remove({ id: group.id });

		expect(result.success).toBe(true);
		expect(mockDb.data.tabs).toHaveLength(0);
		expect(mockTerminalKill).toHaveBeenCalledTimes(2);
		expect(mockTerminalKill).toHaveBeenCalledWith({ tabId: child1.id });
		expect(mockTerminalKill).toHaveBeenCalledWith({ tabId: child2.id });
	});

	it("should update activeTabId when removing active tab", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const tab1 = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});
		const tab2 = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		// Set tab2 as active
		await caller.setActive({ tabId: tab2.id });
		expect(mockDb.data.workspaces[0].activeTabId).toBe(tab2.id);

		// Remove tab2
		await caller.remove({ id: tab2.id });

		// Should fall back to tab1
		expect(mockDb.data.workspaces[0].activeTabId).toBe(tab1.id);
	});

	it("should update activeTabId when removing group with active child", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		// Create another top-level tab first
		const regularTab = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		// Create a group with children
		const group = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});
		const child = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});

		// Set child as active
		await caller.setActive({ tabId: child.id });
		expect(mockDb.data.workspaces[0].activeTabId).toBe(child.id);

		// Remove the group (which includes the active child)
		await caller.remove({ id: group.id });

		// Should fall back to regularTab
		expect(mockDb.data.workspaces[0].activeTabId).toBe(regularTab.id);
	});

	it("should delete empty parent when removing last child", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const group = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});
		const child = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});

		// Set up layout
		await caller.updateLayout({
			groupId: group.id,
			layout: child.id,
		});

		// Remove the child
		await caller.remove({ id: child.id });

		// Both child and empty parent should be deleted
		expect(mockDb.data.tabs).toHaveLength(0);
	});

	it("should update activeTabId when removing child causes parent deletion", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		// Create a regular tab first
		const regularTab = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		// Create a group with one child
		const group = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});
		const child = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});

		// Set up layout
		await caller.updateLayout({
			groupId: group.id,
			layout: child.id,
		});

		// Set child as active
		await caller.setActive({ tabId: child.id });
		expect(mockDb.data.workspaces[0].activeTabId).toBe(child.id);

		// Remove the child (which will also delete the empty parent)
		await caller.remove({ id: child.id });

		// Should fall back to regularTab
		expect(mockDb.data.workspaces[0].activeTabId).toBe(regularTab.id);
	});
});

describe("tabs router - update", () => {
	it("should update tab title", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const tab = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		await caller.update({
			id: tab.id,
			patch: { title: "Updated Title" },
		});

		const updated = mockDb.data.tabs.find((t) => t.id === tab.id);
		expect(updated?.title).toBe("Updated Title");
	});

	it("should update needsAttention flag", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const tab = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		await caller.update({
			id: tab.id,
			patch: { needsAttention: true },
		});

		const updated = mockDb.data.tabs.find((t) => t.id === tab.id);
		expect(updated?.needsAttention).toBe(true);
	});
});

describe("tabs router - setActive", () => {
	it("should set tab as active and activate workspace", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const tab = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		await caller.setActive({ tabId: tab.id });

		expect(mockDb.data.workspaces[0].activeTabId).toBe(tab.id);
		expect(mockDb.data.workspaces[0].isActive).toBe(true);
	});

	it("should clear needsAttention flag when setting active", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const tab = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		await caller.update({
			id: tab.id,
			patch: { needsAttention: true },
		});

		await caller.setActive({ tabId: tab.id });

		const updated = mockDb.data.tabs.find((t) => t.id === tab.id);
		expect(updated?.needsAttention).toBe(false);
	});
});

describe("tabs router - reorder", () => {
	it("should reorder tabs correctly", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const tab1 = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});
		const tab2 = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});
		const tab3 = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		// Move tab3 to position 0
		await caller.reorder({ tabId: tab3.id, targetIndex: 0 });

		const tabs = mockDb.data.tabs
			.filter((t) => !t.parentId)
			.sort((a, b) => a.position - b.position);

		expect(tabs[0].id).toBe(tab3.id);
		expect(tabs[1].id).toBe(tab1.id);
		expect(tabs[2].id).toBe(tab2.id);
	});
});

describe("tabs router - updateLayout", () => {
	it("should update group layout", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const group = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});
		const child1 = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});
		const child2 = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});

		const layout: MosaicNode<string> = {
			direction: "row",
			first: child1.id,
			second: child2.id,
		};

		await caller.updateLayout({ groupId: group.id, layout });

		const updated = mockDb.data.tabs.find((t) => t.id === group.id);
		expect(updated?.layout).toEqual(layout);
	});

	it("should delete removed tabs when layout changes", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const group = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});
		const child1 = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});
		const child2 = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});

		// Set layout with both children
		await caller.updateLayout({
			groupId: group.id,
			layout: {
				direction: "row",
				first: child1.id,
				second: child2.id,
			},
		});

		mockTerminalKill.mockClear();

		// Update layout to only include child1
		await caller.updateLayout({
			groupId: group.id,
			layout: child1.id,
		});

		expect(mockDb.data.tabs.find((t) => t.id === child2.id)).toBeUndefined();
		expect(mockTerminalKill).toHaveBeenCalledWith({ tabId: child2.id });
	});

	it("should delete group when layout is null", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const group = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});

		await caller.updateLayout({ groupId: group.id, layout: null });

		expect(mockDb.data.tabs.find((t) => t.id === group.id)).toBeUndefined();
	});

	it("should update activeTabId when removing child via layout change", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		// Create a regular tab first
		const regularTab = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		const group = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});
		const child1 = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});
		const child2 = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});

		// Set layout with both children
		await caller.updateLayout({
			groupId: group.id,
			layout: {
				direction: "row",
				first: child1.id,
				second: child2.id,
			},
		});

		// Set child2 as active
		await caller.setActive({ tabId: child2.id });
		expect(mockDb.data.workspaces[0].activeTabId).toBe(child2.id);

		// Update layout to remove child2
		await caller.updateLayout({
			groupId: group.id,
			layout: child1.id,
		});

		// Should fall back to regularTab
		expect(mockDb.data.workspaces[0].activeTabId).toBe(regularTab.id);
	});

	it("should update activeTabId when deleting group via null layout", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		// Create a regular tab first
		const regularTab = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		const group = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});

		// Set group as active
		await caller.setActive({ tabId: group.id });
		expect(mockDb.data.workspaces[0].activeTabId).toBe(group.id);

		// Delete group via null layout
		await caller.updateLayout({ groupId: group.id, layout: null });

		// Should fall back to regularTab
		expect(mockDb.data.workspaces[0].activeTabId).toBe(regularTab.id);
	});
});

describe("tabs router - addChildTab", () => {
	it("should add child tab to group", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const group = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});

		const child = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});

		expect(child.parentId).toBe(group.id);
		expect(child.workspaceId).toBe("workspace-1");
		expect(mockDb.data.tabs).toHaveLength(2);
	});
});

describe("tabs router - ungroup", () => {
	it("should ungroup children and delete group", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const group = await caller.create({
			workspaceId: "workspace-1",
			type: "group",
		});
		const child1 = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});
		const child2 = await caller.addChildTab({
			groupId: group.id,
			type: "terminal",
		});

		await caller.ungroup({ groupId: group.id });

		// Children should no longer have parentId
		const updated1 = mockDb.data.tabs.find((t) => t.id === child1.id);
		const updated2 = mockDb.data.tabs.find((t) => t.id === child2.id);

		expect(updated1?.parentId).toBeUndefined();
		expect(updated2?.parentId).toBeUndefined();

		// Group should be deleted
		expect(mockDb.data.tabs.find((t) => t.id === group.id)).toBeUndefined();

		// Should have correct positions
		expect(updated1?.position).toBe(0);
		expect(updated2?.position).toBe(1);
	});
});

describe("tabs router - queries", () => {
	it("getByWorkspace should return tabs sorted by position", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const tab1 = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});
		const tab2 = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		const result = await caller.getByWorkspace({ workspaceId: "workspace-1" });

		expect(result).toHaveLength(2);
		expect(result[0].id).toBe(tab1.id);
		expect(result[1].id).toBe(tab2.id);
	});

	it("getActive should return active tab", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		const tab = await caller.create({
			workspaceId: "workspace-1",
			type: "terminal",
		});

		const result = await caller.getActive({ workspaceId: "workspace-1" });

		expect(result?.id).toBe(tab.id);
	});

	it("getActive should return null when no active tab", async () => {
		const router = createTabsRouter();
		const caller = router.createCaller({});

		mockDb.data.workspaces[0].activeTabId = undefined;

		const result = await caller.getActive({ workspaceId: "workspace-1" });

		expect(result).toBeNull();
	});
});
