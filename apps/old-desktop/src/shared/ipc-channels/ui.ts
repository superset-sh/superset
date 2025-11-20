/**
 * UI-related IPC channels for Desktop app
 */

import type { MosaicNode, Tab } from "../types";
import type { IpcResponse, NoRequest } from "./types";

export interface UiChannels {
	// Workspace UI state
	"ui-workspace-get": {
		request: { workspaceId: string };
		response: IpcResponse<{
			workspaceId: string;
			activeWorktreePath: string | null;
			worktrees: Record<
				string,
				{
					path: string;
					branch: string;
					description?: string;
					prUrl?: string;
					merged?: boolean;
					tabs: Tab[];
					mosaicTree?: MosaicNode<string>;
					activeTabId: string | null;
					updatedAt: string;
				}
			>;
			updatedAt: string;
		}>;
	};

	"ui-workspace-update": {
		request: {
			workspaceId: string;
			patch: {
				activeWorktreePath?: string | null;
				worktrees?: Record<
					string,
					{
						path: string;
						branch: string;
						description?: string;
						prUrl?: string;
						merged?: boolean;
						tabs: Tab[];
						mosaicTree?: MosaicNode<string>;
						activeTabId: string | null;
						updatedAt: string;
					}
				>;
			};
		};
		response: IpcResponse;
	};

	"ui-set-active": {
		request: {
			workspaceId: string;
			activeWorktreePath?: string | null;
			activeTabId?: string | null;
			updateGlobalActiveWorkspace?: boolean;
		};
		response: IpcResponse;
	};

	// Settings
	"ui-settings-get": {
		request: NoRequest;
		response: IpcResponse<{
			lastActiveWorkspaceId: string | null;
			preferences?: Record<string, unknown>;
		}>;
	};

	"ui-settings-update": {
		request: {
			lastActiveWorkspaceId?: string | null;
			preferences?: Record<string, unknown>;
		};
		response: IpcResponse;
	};
}
