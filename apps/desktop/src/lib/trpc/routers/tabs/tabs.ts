import type { MosaicNode } from "react-mosaic-component";
import { updateTree } from "react-mosaic-component";
import { db } from "main/lib/db";
import type { Tab } from "main/lib/db/schemas";
import { terminalManager } from "main/lib/terminal-manager";
import { nanoid } from "nanoid";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { extractTabIdsFromLayout, removeTabFromLayout } from "./utils/layout";

export const createTabsRouter = () => {
	return router({
		// Queries
		getByWorkspace: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				return db.data.tabs
					.filter((t) => t.workspaceId === input.workspaceId)
					.sort((a, b) => a.position - b.position);
			}),

		getActive: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				const workspace = db.data.workspaces.find(
					(w) => w.id === input.workspaceId,
				);
				if (!workspace?.activeTabId) {
					return null;
				}
				return db.data.tabs.find((t) => t.id === workspace.activeTabId) || null;
			}),

		// Core Mutations
		create: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					type: z.enum(["terminal", "group"]),
				}),
			)
			.mutation(async ({ input }) => {
				const workspaceTabs = db.data.tabs.filter(
					(t) => t.workspaceId === input.workspaceId && !t.parentId,
				);
				const maxPosition =
					workspaceTabs.length > 0
						? Math.max(...workspaceTabs.map((t) => t.position))
						: -1;

				const newTab: Tab = {
					id: nanoid(),
					workspaceId: input.workspaceId,
					title: input.type === "terminal" ? "New Terminal" : "New Split View",
					type: input.type,
					position: maxPosition + 1,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				};

				await db.update((data) => {
					data.tabs.push(newTab);

					// Set as active tab
					const workspace = data.workspaces.find(
						(w) => w.id === input.workspaceId,
					);
					if (workspace) {
						workspace.activeTabId = newTab.id;
					}
				});

				return newTab;
			}),

		remove: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const tab = db.data.tabs.find((t) => t.id === input.id);
				if (!tab) {
					return { success: false, error: "Tab not found" };
				}

				await db.update((data) => {
					// Collect all removed tab IDs
					const removedTabIds: string[] = [];

					// If tab has children (is a group), delete them too
					if (tab.type === "group") {
						const childIds = data.tabs
							.filter((t) => t.parentId === tab.id)
							.map((t) => t.id);

						removedTabIds.push(tab.id, ...childIds);

						data.tabs = data.tabs.filter(
							(t) => t.id !== tab.id && !childIds.includes(t.id),
						);

						// Kill terminals for children
						for (const childId of childIds) {
							terminalManager.kill({ tabId: childId });
						}
					} else {
						// If tab is a child, remove from parent layout
						if (tab.parentId) {
							const parent = data.tabs.find((t) => t.id === tab.parentId);
							if (parent && parent.type === "group" && parent.layout) {
								parent.layout = removeTabFromLayout(parent.layout, tab.id);

								// If parent becomes empty, delete it
								if (!parent.layout) {
									removedTabIds.push(parent.id);
									data.tabs = data.tabs.filter((t) => t.id !== parent.id);
								}
							}
						}

						removedTabIds.push(tab.id);
						data.tabs = data.tabs.filter((t) => t.id !== tab.id);

						// Kill terminal if terminal type
						if (tab.type === "terminal") {
							terminalManager.kill({ tabId: tab.id });
						}
					}

					// Update active tab if needed
					const workspace = data.workspaces.find(
						(w) => w.id === tab.workspaceId,
					);
					if (
						workspace?.activeTabId &&
						removedTabIds.includes(workspace.activeTabId)
					) {
						const remainingTabs = data.tabs
							.filter((t) => t.workspaceId === tab.workspaceId && !t.parentId)
							.sort((a, b) => a.position - b.position);
						workspace.activeTabId = remainingTabs[0]?.id;
					}
				});

				return { success: true };
			}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					patch: z.object({
						title: z.string().optional(),
						needsAttention: z.boolean().optional(),
					}),
				}),
			)
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const tab = data.tabs.find((t) => t.id === input.id);
					if (!tab) {
						throw new Error("Tab not found");
					}

					if (input.patch.title !== undefined) {
						tab.title = input.patch.title;
					}
					if (input.patch.needsAttention !== undefined) {
						tab.needsAttention = input.patch.needsAttention;
					}

					tab.updatedAt = Date.now();
				});

				return { success: true };
			}),

		setActive: publicProcedure
			.input(z.object({ tabId: z.string() }))
			.mutation(async ({ input }) => {
				const tab = db.data.tabs.find((t) => t.id === input.tabId);
				if (!tab) {
					throw new Error("Tab not found");
				}

				await db.update((data) => {
					// Deactivate all workspaces
					for (const ws of data.workspaces) {
						ws.isActive = false;
					}

					// Activate workspace and set active tab
					const workspace = data.workspaces.find(
						(w) => w.id === tab.workspaceId,
					);
					if (workspace) {
						workspace.activeTabId = input.tabId;
						workspace.isActive = true;
						workspace.lastOpenedAt = Date.now();
					}

					// Clear needs attention flag
					const t = data.tabs.find((t) => t.id === input.tabId);
					if (t) {
						t.needsAttention = false;
					}
				});

				return { success: true };
			}),

		reorder: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
					targetIndex: z.number(),
				}),
			)
			.mutation(async ({ input }) => {
				const tab = db.data.tabs.find((t) => t.id === input.tabId);
				if (!tab) {
					throw new Error("Tab not found");
				}

				await db.update((data) => {
					const workspaceTabs = data.tabs
						.filter((t) => t.workspaceId === tab.workspaceId && !t.parentId)
						.sort((a, b) => a.position - b.position);

					const currentIndex = workspaceTabs.findIndex(
						(t) => t.id === input.tabId,
					);
					if (currentIndex === -1) return;

					// Reorder
					const [moved] = workspaceTabs.splice(currentIndex, 1);
					workspaceTabs.splice(input.targetIndex, 0, moved);

					// Update positions
					for (let index = 0; index < workspaceTabs.length; index++) {
						const t = workspaceTabs[index];
						const tabInDb = data.tabs.find((tab) => tab.id === t.id);
						if (tabInDb) {
							tabInDb.position = index;
						}
					}
				});

				return { success: true };
			}),

		// Group Operations
		updateLayout: publicProcedure
			.input(
				z.object({
					groupId: z.string(),
					layout: z.any(), // MosaicNode<string> | null
				}),
			)
			.mutation(async ({ input }) => {
				const group = db.data.tabs.find((t) => t.id === input.groupId);
				if (!group || group.type !== "group") {
					throw new Error("Group not found");
				}

				const oldTabIds = extractTabIdsFromLayout(group.layout || null);
				const newTabIds = extractTabIdsFromLayout(input.layout);
				const removedTabIds = Array.from(oldTabIds).filter(
					(id) => !newTabIds.has(id),
				);

				await db.update((data) => {
					const g = data.tabs.find((t) => t.id === input.groupId);
					if (g && g.type === "group") {
						g.layout = input.layout;
						g.updatedAt = Date.now();

						// If layout is null, delete the group
						if (!input.layout) {
							removedTabIds.push(input.groupId);
							data.tabs = data.tabs.filter((t) => t.id !== input.groupId);
						}
					}

					// Delete removed tabs
					data.tabs = data.tabs.filter((t) => !removedTabIds.includes(t.id));

					// Update active tab if needed
					const workspace = data.workspaces.find(
						(w) => w.id === group.workspaceId,
					);
					if (
						workspace?.activeTabId &&
						removedTabIds.includes(workspace.activeTabId)
					) {
						const remainingTabs = data.tabs
							.filter((t) => t.workspaceId === group.workspaceId && !t.parentId)
							.sort((a, b) => a.position - b.position);
						workspace.activeTabId = remainingTabs[0]?.id;
					}
				});

				// Kill terminals for removed tabs
				for (const tabId of removedTabIds) {
					terminalManager.kill({ tabId });
				}

				return { success: true };
			}),

		addChildTab: publicProcedure
			.input(
				z.object({
					groupId: z.string(),
					type: z.enum(["terminal"]),
				}),
			)
			.mutation(async ({ input }) => {
				const group = db.data.tabs.find((t) => t.id === input.groupId);
				if (!group || group.type !== "group") {
					throw new Error("Group not found");
				}

				const newTab: Tab = {
					id: nanoid(),
					workspaceId: group.workspaceId,
					parentId: input.groupId,
					title: "New Terminal",
					type: input.type,
					position: 0, // Child tabs don't need position
					createdAt: Date.now(),
					updatedAt: Date.now(),
				};

				await db.update((data) => {
					data.tabs.push(newTab);
				});

				// Frontend will call updateLayout to add this tab to mosaic
				return newTab;
			}),

		ungroup: publicProcedure
			.input(z.object({ groupId: z.string() }))
			.mutation(async ({ input }) => {
				const group = db.data.tabs.find((t) => t.id === input.groupId);
				if (!group || group.type !== "group") {
					throw new Error("Group not found");
				}

				await db.update((data) => {
					const children = data.tabs.filter(
						(t) => t.parentId === input.groupId,
					);
					const workspaceTabs = data.tabs.filter(
						(t) => t.workspaceId === group.workspaceId && !t.parentId,
					);
					const groupIndex = workspaceTabs.findIndex(
						(t) => t.id === input.groupId,
					);

					// Remove parentId from children and assign positions
					for (const child of children) {
						delete child.parentId;
						child.position = groupIndex + children.indexOf(child);
					}

					// Recompute positions for all workspace tabs
					const allTabs = data.tabs
						.filter((t) => t.workspaceId === group.workspaceId && !t.parentId)
						.filter((t) => t.id !== input.groupId)
						.sort((a, b) => a.position - b.position);

					for (let i = 0; i < allTabs.length; i++) {
						allTabs[i].position = i;
					}

					// Delete group
					data.tabs = data.tabs.filter((t) => t.id !== input.groupId);
				});

				return { success: true };
			}),

		moveOutOfGroup: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
					targetIndex: z.number(),
				}),
			)
			.mutation(async ({ input }) => {
				const tab = db.data.tabs.find((t) => t.id === input.tabId);
				if (!tab || !tab.parentId) {
					throw new Error("Tab not found or not in a group");
				}

				await db.update((data) => {
					const t = data.tabs.find((t) => t.id === input.tabId);
					if (!t || !t.parentId) return;

					// Remove from parent
					delete t.parentId;

					// Reorder to target position
					const workspaceTabs = data.tabs
						.filter((t) => t.workspaceId === tab.workspaceId && !t.parentId)
						.sort((a, b) => a.position - b.position);

					const currentIndex = workspaceTabs.findIndex(
						(t) => t.id === input.tabId,
					);
					const [moved] = workspaceTabs.splice(currentIndex, 1);
					workspaceTabs.splice(input.targetIndex, 0, moved);

					// Update all positions
					for (let i = 0; i < workspaceTabs.length; i++) {
						const tab = data.tabs.find((t) => t.id === workspaceTabs[i].id);
						if (tab) {
							tab.position = i;
						}
					}
				});

				return { success: true };
			}),

		setParent: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
					parentId: z.string().nullable(),
				}),
			)
			.mutation(async ({ input }) => {
				const tab = db.data.tabs.find((t) => t.id === input.tabId);
				if (!tab) {
					throw new Error("Tab not found");
				}

				if (input.parentId) {
					const parent = db.data.tabs.find((t) => t.id === input.parentId);
					if (!parent || parent.type !== "group") {
						throw new Error("Parent must be a group tab");
					}
				}

				await db.update((data) => {
					const t = data.tabs.find((t) => t.id === input.tabId);
					if (!t) return;

					if (input.parentId) {
						t.parentId = input.parentId;
					} else {
						delete t.parentId;
					}

					t.updatedAt = Date.now();
				});

				return { success: true };
			}),

		splitActiveTab: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					direction: z.enum(["row", "column"]),
				}),
			)
			.mutation(async ({ input }) => {
				const workspace = db.data.workspaces.find(
					(w) => w.id === input.workspaceId,
				);
				if (!workspace?.activeTabId) {
					throw new Error("No active tab in workspace");
				}

				const activeTab = db.data.tabs.find(
					(t) => t.id === workspace.activeTabId,
				);
				if (!activeTab) {
					throw new Error("Active tab not found");
				}

				// Find the terminal to split
				let terminalToSplit;
				if (activeTab.type === "terminal") {
					terminalToSplit = activeTab;
				} else {
					// Active tab is a group - find first child terminal
					terminalToSplit = db.data.tabs.find(
						(t) => t.parentId === activeTab.id && t.type === "terminal",
					);
				}

				if (!terminalToSplit) {
					throw new Error("No terminal found to split");
				}

				// Perform the split (inline logic from split procedure)
				await db.update((data) => {
					const t = data.tabs.find((t) => t.id === terminalToSplit!.id);
					if (!t || t.type !== "terminal") return;

					// Only handle standalone terminal case (no path for splitActiveTab)
					if (!t.parentId) {
						const groupId = nanoid();
						const newChildId = nanoid();

						// Create group tab
						const groupTab: Tab = {
							id: groupId,
							workspaceId: t.workspaceId,
							title: `${t.title} - Split`,
							type: "group",
							position: t.position,
							layout: {
								direction: input.direction,
								first: t.id,
								second: newChildId,
								splitPercentage: 50,
							},
							createdAt: Date.now(),
							updatedAt: Date.now(),
						};

						// Create new child terminal
						const newChildTab: Tab = {
							id: newChildId,
							workspaceId: t.workspaceId,
							parentId: groupId,
							title: "New Terminal",
							type: "terminal",
							position: 0,
							createdAt: Date.now(),
							updatedAt: Date.now(),
						};

						// Update original tab to be child of group
						t.parentId = groupId;

						// Add tabs to data
						data.tabs.push(groupTab, newChildTab);

						// Set group as active
						const ws = data.workspaces.find(
							(w) => w.id === t.workspaceId,
						);
						if (ws) {
							ws.activeTabId = groupId;
						}
					}
				});

				return { success: true };
			}),

		split: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
					direction: z.enum(["row", "column"]),
					path: z.array(z.enum(["first", "second"])).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const tab = db.data.tabs.find((t) => t.id === input.tabId);
				if (!tab || tab.type !== "terminal") {
					throw new Error("Can only split terminal tabs");
				}

				await db.update((data) => {
					const t = data.tabs.find((t) => t.id === input.tabId);
					if (!t || t.type !== "terminal") return;

					// Case 1: Splitting a standalone terminal → create group
					if (!t.parentId) {
						const groupId = nanoid();
						const newChildId = nanoid();

						// Create group tab
						const groupTab: Tab = {
							id: groupId,
							workspaceId: t.workspaceId,
							title: `${t.title} - Split`,
							type: "group",
							position: t.position,
							layout: {
								direction: input.direction,
								first: t.id,
								second: newChildId,
								splitPercentage: 50,
							},
							createdAt: Date.now(),
							updatedAt: Date.now(),
						};

						// Create new child terminal
						const newChildTab: Tab = {
							id: newChildId,
							workspaceId: t.workspaceId,
							parentId: groupId,
							title: "New Terminal",
							type: "terminal",
							position: 0,
							createdAt: Date.now(),
							updatedAt: Date.now(),
						};

						// Update original tab to be child of group
						t.parentId = groupId;

						// Add tabs to data
						data.tabs.push(groupTab, newChildTab);

						// Set group as active
						const workspace = data.workspaces.find(
							(w) => w.id === t.workspaceId,
						);
						if (workspace) {
							workspace.activeTabId = groupId;
						}
					}
					// Case 2: Splitting within a group → add child and update layout
					else if (input.path) {
						const parent = data.tabs.find((tab) => tab.id === t.parentId);
						if (!parent || parent.type !== "group" || !parent.layout) return;

						const newChildId = nanoid();

						// Create new child terminal
						const newChildTab: Tab = {
							id: newChildId,
							workspaceId: t.workspaceId,
							parentId: t.parentId,
							title: "New Terminal",
							type: "terminal",
							position: 0,
							createdAt: Date.now(),
							updatedAt: Date.now(),
						};

						// Update layout using Mosaic's updateTree
						parent.layout = updateTree(parent.layout, [
							{
								path: input.path,
								spec: {
									$set: {
										direction: input.direction,
										first: t.id,
										second: newChildId,
										splitPercentage: 50,
									},
								},
							},
						]);
						parent.updatedAt = Date.now();

						data.tabs.push(newChildTab);
					}
				});

				return { success: true };
			}),
	});
};

export type TabsRouter = ReturnType<typeof createTabsRouter>;

// Export Tab type for use in components
export type Tab = TabsRouter["getByWorkspace"]["_def"]["_output_out"][number];
