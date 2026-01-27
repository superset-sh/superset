import type { Collection } from "@tanstack/react-db";
import type { MosaicNode } from "react-mosaic-component";
import type {
	AddBrowserPaneParams,
	AddSummaryPaneParams,
	AddTerminalPaneParams,
	AgentNotification,
	AgentScreen,
	CreateScreenParams,
	NotifyUserParams,
} from "./types";

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Recursively removes a pane ID from a MosaicNode layout tree.
 * Returns the new layout, or null if the entire tree should be removed.
 */
function removePaneFromLayout(
	layout: MosaicNode<string> | null,
	paneId: string,
): MosaicNode<string> | null {
	if (layout === null) {
		return null;
	}

	// If it's a leaf node (string), check if it matches
	if (typeof layout === "string") {
		return layout === paneId ? null : layout;
	}

	// It's a branch node with first/second
	const newFirst = removePaneFromLayout(layout.first, paneId);
	const newSecond = removePaneFromLayout(layout.second, paneId);

	// If both children are gone, return null
	if (newFirst === null && newSecond === null) {
		return null;
	}

	// If one child is gone, return the other (collapse the branch)
	if (newFirst === null) {
		return newSecond;
	}
	if (newSecond === null) {
		return newFirst;
	}

	// Both children still exist, return updated branch
	return {
		...layout,
		first: newFirst,
		second: newSecond,
	};
}

/**
 * Helper functions for agent screen operations using TanStack DB collections.
 * These functions work with the collections from CollectionsProvider.
 */
export const agentScreenOperations = {
	createScreen: (
		collection: Collection<AgentScreen>,
		params: CreateScreenParams,
	): string => {
		const id = generateId();
		const screen: AgentScreen = {
			id,
			workspaceId: params.workspaceId,
			organizationId: params.organizationId,
			title: params.title,
			description: params.description,
			layout: null,
			panes: {},
			createdAt: new Date().toISOString(),
			status: "composing",
		};
		collection.insert(screen);
		return id;
	},

	updateScreen: (
		collection: Collection<AgentScreen>,
		screenId: string,
		updates: Partial<Pick<AgentScreen, "title" | "description" | "status">>,
	): void => {
		const screen = collection.get(screenId);
		if (!screen) {
			console.warn(`[agent-screens] Screen not found: ${screenId}`);
			return;
		}
		collection.update(screenId, (draft) => {
			if (updates.title !== undefined) draft.title = updates.title;
			if (updates.description !== undefined)
				draft.description = updates.description;
			if (updates.status !== undefined) draft.status = updates.status;
		});
	},

	setScreenLayout: (
		collection: Collection<AgentScreen>,
		screenId: string,
		layout: MosaicNode<string>,
	): void => {
		const screen = collection.get(screenId);
		if (!screen) {
			console.warn(`[agent-screens] Screen not found: ${screenId}`);
			return;
		}
		collection.update(screenId, (draft) => {
			draft.layout = layout;
		});
	},

	deleteScreen: (
		screensCollection: Collection<AgentScreen>,
		notificationsCollection: Collection<AgentNotification>,
		screenId: string,
	): void => {
		// Collect notification IDs first to avoid mutating while iterating
		const notificationIdsToDelete: string[] = [];
		for (const [id, notification] of notificationsCollection.entries()) {
			if (notification.screenId === screenId) {
				notificationIdsToDelete.push(String(id));
			}
		}
		// Delete notifications
		for (const id of notificationIdsToDelete) {
			notificationsCollection.delete(id);
		}
		// Delete screen
		screensCollection.delete(screenId);
	},

	addBrowserPane: (
		collection: Collection<AgentScreen>,
		params: AddBrowserPaneParams,
	): void => {
		const screen = collection.get(params.screenId);
		if (!screen) {
			console.warn(`[agent-screens] Screen not found: ${params.screenId}`);
			return;
		}
		collection.update(params.screenId, (draft) => {
			draft.panes[params.paneId] = {
				type: "browser",
				id: params.paneId,
				url: params.url,
				title: params.title,
			};
		});
	},

	addTerminalPane: (
		collection: Collection<AgentScreen>,
		params: AddTerminalPaneParams,
	): void => {
		const screen = collection.get(params.screenId);
		if (!screen) {
			console.warn(`[agent-screens] Screen not found: ${params.screenId}`);
			return;
		}
		collection.update(params.screenId, (draft) => {
			draft.panes[params.paneId] = {
				type: "terminal",
				id: params.paneId,
				sessionId: params.sessionId,
			};
		});
	},

	addSummaryPane: (
		collection: Collection<AgentScreen>,
		params: AddSummaryPaneParams,
	): void => {
		const screen = collection.get(params.screenId);
		if (!screen) {
			console.warn(`[agent-screens] Screen not found: ${params.screenId}`);
			return;
		}
		collection.update(params.screenId, (draft) => {
			draft.panes[params.paneId] = {
				type: "summary",
				id: params.paneId,
				content: params.content,
				title: params.title,
			};
		});
	},

	/**
	 * Updates a pane with type-safe property updates.
	 * Only properties valid for the pane's type are applied.
	 */
	updatePane: (
		collection: Collection<AgentScreen>,
		screenId: string,
		paneId: string,
		updates: {
			url?: string;
			title?: string;
			content?: string;
			sessionId?: string;
		},
	): void => {
		const screen = collection.get(screenId);
		if (!screen) {
			console.warn(`[agent-screens] Screen not found: ${screenId}`);
			return;
		}
		const pane = screen.panes[paneId];
		if (!pane) {
			console.warn(`[agent-screens] Pane not found: ${paneId}`);
			return;
		}
		collection.update(screenId, (draft) => {
			const draftPane = draft.panes[paneId];
			if (!draftPane) return;

			// Type-safe updates based on pane type
			switch (draftPane.type) {
				case "browser":
					if (updates.url !== undefined) draftPane.url = updates.url;
					if (updates.title !== undefined) draftPane.title = updates.title;
					break;
				case "terminal":
					if (updates.sessionId !== undefined)
						draftPane.sessionId = updates.sessionId;
					break;
				case "summary":
					if (updates.content !== undefined)
						draftPane.content = updates.content;
					if (updates.title !== undefined) draftPane.title = updates.title;
					break;
			}
		});
	},

	removePane: (
		collection: Collection<AgentScreen>,
		screenId: string,
		paneId: string,
	): void => {
		const screen = collection.get(screenId);
		if (!screen) {
			console.warn(`[agent-screens] Screen not found: ${screenId}`);
			return;
		}
		collection.update(screenId, (draft) => {
			delete draft.panes[paneId];
			// Remove pane from nested layout tree
			draft.layout = removePaneFromLayout(draft.layout, paneId);
		});
	},
};

export const agentNotificationOperations = {
	/**
	 * Creates a notification for a screen and marks the screen as ready.
	 * Returns the notification ID, or null if the screen doesn't exist.
	 */
	notifyUser: (
		screensCollection: Collection<AgentScreen>,
		notificationsCollection: Collection<AgentNotification>,
		params: NotifyUserParams,
	): string | null => {
		// Validate screen exists to prevent orphan notifications
		const screen = screensCollection.get(params.screenId);
		if (!screen) {
			console.warn(
				`[agent-screens] Cannot notify: screen not found: ${params.screenId}`,
			);
			return null;
		}

		const id = generateId();
		const notification: AgentNotification = {
			id,
			screenId: params.screenId,
			organizationId: params.organizationId,
			title: params.title,
			body: params.body,
			priority: params.priority ?? "normal",
			status: "pending",
			createdAt: new Date().toISOString(),
		};
		notificationsCollection.insert(notification);

		// Mark screen as ready when notifying
		if (screen.status === "composing") {
			screensCollection.update(params.screenId, (draft) => {
				draft.status = "ready";
			});
		}
		return id;
	},

	markNotificationViewed: (
		collection: Collection<AgentNotification>,
		notificationId: string,
	): void => {
		collection.update(notificationId, (draft) => {
			draft.status = "viewed";
		});
	},

	dismissNotification: (
		collection: Collection<AgentNotification>,
		notificationId: string,
	): void => {
		collection.update(notificationId, (draft) => {
			draft.status = "dismissed";
		});
	},
};
