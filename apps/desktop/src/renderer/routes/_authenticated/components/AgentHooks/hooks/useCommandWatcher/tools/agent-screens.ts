import {
	agentNotificationOperations,
	agentScreenOperations,
} from "renderer/stores/agent-screens";
import { z } from "zod";
import type { CommandResult, ToolDefinition } from "./types";

// Schema definitions for each tool
const createScreenSchema = z.object({
	workspaceId: z.string(),
	organizationId: z.string(),
	title: z.string(),
	description: z.string().optional(),
});

const updateScreenSchema = z.object({
	screenId: z.string(),
	title: z.string().optional(),
	description: z.string().optional(),
	status: z.enum(["composing", "ready", "viewed", "dismissed"]).optional(),
});

const setScreenLayoutSchema = z.object({
	screenId: z.string(),
	layout: z.any(), // MosaicNode is complex, validate at runtime
});

const deleteScreenSchema = z.object({
	screenId: z.string(),
});

const addBrowserPaneSchema = z.object({
	screenId: z.string(),
	paneId: z.string(),
	url: z.string(),
	title: z.string().optional(),
});

const navigateBrowserSchema = z.object({
	screenId: z.string(),
	paneId: z.string(),
	url: z.string(),
});

const addTerminalPaneSchema = z.object({
	screenId: z.string(),
	paneId: z.string(),
});

const writeTerminalSchema = z.object({
	screenId: z.string(),
	paneId: z.string(),
	data: z.string(),
});

const addSummaryPaneSchema = z.object({
	screenId: z.string(),
	paneId: z.string(),
	content: z.string(),
	title: z.string().optional(),
});

const updateSummarySchema = z.object({
	screenId: z.string(),
	paneId: z.string(),
	content: z.string(),
});

const removePaneSchema = z.object({
	screenId: z.string(),
	paneId: z.string(),
});

const notifyUserSchema = z.object({
	screenId: z.string(),
	organizationId: z.string(),
	title: z.string(),
	body: z.string().optional(),
	priority: z.enum(["normal", "high", "urgent"]).optional(),
});

const cancelNotificationSchema = z.object({
	notificationId: z.string(),
});

// Tool definitions
export const createScreen: ToolDefinition<typeof createScreenSchema> = {
	name: "create_screen",
	schema: createScreenSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			const screenId = agentScreenOperations.createScreen(ctx.agentScreens, {
				workspaceId: params.workspaceId,
				organizationId: params.organizationId,
				title: params.title,
				description: params.description,
			});
			return { success: true, data: { screenId } };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to create screen",
			};
		}
	},
};

export const updateScreen: ToolDefinition<typeof updateScreenSchema> = {
	name: "update_screen",
	schema: updateScreenSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			const updates: Partial<
				Pick<
					import("renderer/stores/agent-screens").AgentScreen,
					"title" | "description" | "status"
				>
			> = {};
			if (params.title !== undefined) updates.title = params.title;
			if (params.description !== undefined)
				updates.description = params.description;
			if (params.status !== undefined)
				updates.status =
					params.status as import("renderer/stores/agent-screens").AgentScreen["status"];

			agentScreenOperations.updateScreen(
				ctx.agentScreens,
				params.screenId,
				updates,
			);
			return { success: true, data: { screenId: params.screenId } };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to update screen",
			};
		}
	},
};

export const setScreenLayout: ToolDefinition<typeof setScreenLayoutSchema> = {
	name: "set_screen_layout",
	schema: setScreenLayoutSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			agentScreenOperations.setScreenLayout(
				ctx.agentScreens,
				params.screenId,
				params.layout,
			);
			return { success: true, data: { screenId: params.screenId } };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to set layout",
			};
		}
	},
};

export const deleteScreen: ToolDefinition<typeof deleteScreenSchema> = {
	name: "delete_screen",
	schema: deleteScreenSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			agentScreenOperations.deleteScreen(
				ctx.agentScreens,
				ctx.agentNotifications,
				params.screenId,
			);
			return { success: true, data: { deleted: true } };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to delete screen",
			};
		}
	},
};

export const addBrowserPane: ToolDefinition<typeof addBrowserPaneSchema> = {
	name: "add_browser_pane",
	schema: addBrowserPaneSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			agentScreenOperations.addBrowserPane(ctx.agentScreens, {
				screenId: params.screenId,
				paneId: params.paneId,
				url: params.url,
				title: params.title,
			});
			return { success: true, data: { paneId: params.paneId } };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to add browser pane",
			};
		}
	},
};

export const navigateBrowser: ToolDefinition<typeof navigateBrowserSchema> = {
	name: "navigate_browser",
	schema: navigateBrowserSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			agentScreenOperations.updatePane(
				ctx.agentScreens,
				params.screenId,
				params.paneId,
				{ url: params.url },
			);
			return { success: true, data: { url: params.url } };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to navigate browser",
			};
		}
	},
};

export const addTerminalPane: ToolDefinition<typeof addTerminalPaneSchema> = {
	name: "add_terminal_pane",
	schema: addTerminalPaneSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			agentScreenOperations.addTerminalPane(ctx.agentScreens, {
				screenId: params.screenId,
				paneId: params.paneId,
			});
			return { success: true, data: { paneId: params.paneId } };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to add terminal pane",
			};
		}
	},
};

export const writeTerminal: ToolDefinition<typeof writeTerminalSchema> = {
	name: "write_terminal",
	schema: writeTerminalSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		// Writing to terminal requires accessing the terminal manager via IPC
		// The terminal pane component will handle data streaming via its subscription
		// For now, we need to send via IPC to the terminal session
		try {
			const screen = ctx.agentScreens.get(params.screenId);
			if (!screen) {
				return { success: false, error: "Screen not found" };
			}
			const pane = screen.panes[params.paneId];
			if (!pane || pane.type !== "terminal") {
				return { success: false, error: "Terminal pane not found" };
			}

			// The session ID follows the pattern: screen-{screenId}-{paneId}
			const sessionId =
				pane.sessionId ?? `screen-${params.screenId}-${params.paneId}`;

			// Send write command via IPC - this requires window.ipcRenderer
			if (typeof window === "undefined" || !window.ipcRenderer) {
				return { success: false, error: "IPC not available" };
			}

			await window.ipcRenderer.invoke("terminal:write", {
				paneId: sessionId,
				data: params.data,
			});

			return { success: true, data: { written: params.data.length } };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to write to terminal",
			};
		}
	},
};

export const addSummaryPane: ToolDefinition<typeof addSummaryPaneSchema> = {
	name: "add_summary_pane",
	schema: addSummaryPaneSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			agentScreenOperations.addSummaryPane(ctx.agentScreens, {
				screenId: params.screenId,
				paneId: params.paneId,
				content: params.content,
				title: params.title,
			});
			return { success: true, data: { paneId: params.paneId } };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to add summary pane",
			};
		}
	},
};

export const updateSummary: ToolDefinition<typeof updateSummarySchema> = {
	name: "update_summary",
	schema: updateSummarySchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			agentScreenOperations.updatePane(
				ctx.agentScreens,
				params.screenId,
				params.paneId,
				{
					content: params.content,
				},
			);
			return { success: true, data: { paneId: params.paneId } };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to update summary",
			};
		}
	},
};

export const removePane: ToolDefinition<typeof removePaneSchema> = {
	name: "remove_pane",
	schema: removePaneSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			agentScreenOperations.removePane(
				ctx.agentScreens,
				params.screenId,
				params.paneId,
			);
			return { success: true, data: { removed: true } };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to remove pane",
			};
		}
	},
};

export const notifyUser: ToolDefinition<typeof notifyUserSchema> = {
	name: "notify_user",
	schema: notifyUserSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			const notificationId = agentNotificationOperations.notifyUser(
				ctx.agentScreens,
				ctx.agentNotifications,
				{
					screenId: params.screenId,
					organizationId: params.organizationId,
					title: params.title,
					body: params.body,
					priority: params.priority,
				},
			);
			if (notificationId === null) {
				return { success: false, error: "Screen not found" };
			}
			return { success: true, data: { notificationId } };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to notify user",
			};
		}
	},
};

export const cancelNotification: ToolDefinition<
	typeof cancelNotificationSchema
> = {
	name: "cancel_notification",
	schema: cancelNotificationSchema,
	execute: async (params, ctx): Promise<CommandResult> => {
		try {
			agentNotificationOperations.dismissNotification(
				ctx.agentNotifications,
				params.notificationId,
			);
			return { success: true, data: { dismissed: true } };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to cancel notification",
			};
		}
	},
};

// Export all tools as an array for registration
export const agentScreenTools = [
	createScreen,
	updateScreen,
	setScreenLayout,
	deleteScreen,
	addBrowserPane,
	navigateBrowser,
	addTerminalPane,
	writeTerminal,
	addSummaryPane,
	updateSummary,
	removePane,
	notifyUser,
	cancelNotification,
];
