/**
 * Tab-related IPC channels
 */

import type { CreateTabInput, MosaicNode, Tab, UpdatePreviewTabInput } from "../types";
import type { IpcResponse } from "./types";

export interface TabChannels {
	"tab-create": {
		request: CreateTabInput;
		response: { success: boolean; tab?: Tab; error?: string };
	};

	"tab-delete": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabId: string;
		};
		response: IpcResponse;
	};

	"tab-update-preview": {
		request: UpdatePreviewTabInput;
		response: IpcResponse;
	};

	"tab-update-name": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabId: string;
			name: string;
		};
		response: IpcResponse;
	};

	"tab-reorder": {
		request: {
			workspaceId: string;
			worktreeId: string;
			parentTabId?: string;
			tabIds: string[];
		};
		response: IpcResponse;
	};

	"tab-move": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabId: string;
			sourceParentTabId?: string;
			targetParentTabId?: string;
			targetIndex: number;
		};
		response: IpcResponse;
	};

	"tab-update-mosaic-tree": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabId: string;
			mosaicTree: MosaicNode<string> | null | undefined;
		};
		response: IpcResponse;
	};
}

