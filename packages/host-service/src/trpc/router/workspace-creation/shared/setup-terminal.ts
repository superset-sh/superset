import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTerminalSessionInternal } from "../../../../terminal/terminal";
import type { HostServiceContext } from "../../../../types";
import {
	getSetupWorkspaceNamePath,
	writeSetupWorkspaceName,
} from "../../workspace/workspace-name-artifacts";
import type { TerminalDescriptor } from "./types";

const WORKSPACE_NAME_WAIT_SECONDS = 30;

export function startSetupTerminalIfPresent(args: {
	ctx: HostServiceContext;
	workspaceId: string;
	worktreePath: string;
	workspaceName?: string;
	workspaceNamePending?: boolean;
}): { terminal: TerminalDescriptor | null; warning: string | null } {
	const setupScriptPath = join(args.worktreePath, ".superset", "setup.sh");
	if (!existsSync(setupScriptPath)) {
		return { terminal: null, warning: null };
	}

	const workspaceNamePath = getSetupWorkspaceNamePath(args.worktreePath);
	if (args.workspaceName && !args.workspaceNamePending) {
		writeSetupWorkspaceName(args.worktreePath, args.workspaceName);
	}

	const terminalId = crypto.randomUUID();
	const result = createTerminalSessionInternal({
		terminalId,
		workspaceId: args.workspaceId,
		db: args.ctx.db,
		initialCommand: buildSetupCommand({
			setupScriptPath,
			workspaceName: args.workspaceName,
			workspaceNamePath,
			waitForWorkspaceName: args.workspaceNamePending === true,
		}),
	});
	if ("error" in result) {
		return {
			terminal: null,
			warning: `Failed to start setup terminal: ${result.error}`,
		};
	}

	return {
		terminal: {
			id: terminalId,
			role: "setup",
			label: "Workspace Setup",
		},
		warning: null,
	};
}

function buildSetupCommand(args: {
	setupScriptPath: string;
	workspaceName?: string;
	workspaceNamePath: string;
	waitForWorkspaceName: boolean;
}): string {
	const envAssignments = [
		`SUPERSET_SETUP_WORKSPACE_NAME_FILE=${singleQuote(args.workspaceNamePath)}`,
	];
	if (args.workspaceName) {
		envAssignments.push(
			`SUPERSET_SETUP_WORKSPACE_NAME=${singleQuote(args.workspaceName)}`,
		);
	}
	if (args.waitForWorkspaceName) {
		envAssignments.push(
			`SUPERSET_SETUP_WORKSPACE_NAME_WAIT_SECONDS=${WORKSPACE_NAME_WAIT_SECONDS}`,
		);
	}

	return `${envAssignments.join(" ")} bash ${singleQuote(args.setupScriptPath)}`;
}

/** POSIX single-quote escape: safe for any path passed through a shell. */
function singleQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
