/**
 * Cloud sandbox-related IPC channels
 */

import type { CloudSandbox } from "../types";

export interface CloudChannels {
	// Cloud sandbox operations
	"cloud-sandbox-create": {
		request: {
			name: string;
			projectId: string; // Project ID - main process will look up the repo path
			taskDescription?: string;
		};
		response: {
			success: boolean;
			sandbox?: CloudSandbox;
			error?: string;
		};
	};

	"cloud-sandbox-delete": {
		request: { sandboxId: string };
		response: {
			success: boolean;
			error?: string;
		};
	};

	"cloud-sandbox-list": {
		request: Record<string, never>;
		response: {
			success: boolean;
			sandboxes?: CloudSandbox[];
			error?: string;
		};
	};

	"cloud-sandbox-status": {
		request: { sandboxId: string };
		response: {
			success: boolean;
			status?: "running" | "stopped" | "error";
			error?: string;
		};
	};

	"worktree-set-cloud-sandbox": {
		request: {
			worktreeId: string;
			cloudSandbox: CloudSandbox | null;
		};
		response: {
			success: boolean;
			error?: string;
		};
	};
}
