import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { HostServiceContext } from "../../../types";

const WORKSPACE_NAME_FILE = "workspace-name";
const WORKSPACE_NAME_ENV_COMMENT = "# Workspace Name (managed by Superset)";
const MANAGED_WORKSPACE_NAME_ENV_COMMENTS = new Set([
	WORKSPACE_NAME_ENV_COMMENT,
	"# Workspace Name (last assignment wins)",
	"# Workspace Name (from v2 workspace rename)",
]);

export function getSetupWorkspaceNamePath(worktreePath: string): string {
	return join(worktreePath, ".superset", WORKSPACE_NAME_FILE);
}

export function clearSetupWorkspaceName(worktreePath: string): void {
	rmSync(getSetupWorkspaceNamePath(worktreePath), { force: true });
}

export function writeSetupWorkspaceName(
	worktreePath: string,
	workspaceName: string,
): void {
	const trimmed = workspaceName.trim();
	if (!trimmed) return;

	const workspaceNamePath = getSetupWorkspaceNamePath(worktreePath);
	mkdirSync(dirname(workspaceNamePath), { recursive: true });
	writeFileSync(workspaceNamePath, `${trimmed}\n`, "utf8");
}

export function writeWorkspaceNameToGeneratedEnv(
	worktreePath: string,
	workspaceName: string,
): void {
	const trimmed = workspaceName.trim();
	if (!trimmed) return;

	const envPath = join(worktreePath, ".env");
	if (!existsSync(envPath)) return;

	const original = readFileSync(envPath, "utf8");
	const lines = original.split(/\r?\n/);
	if (lines.at(-1) === "") lines.pop();

	const nextLines: string[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (line === undefined) continue;

		if (
			MANAGED_WORKSPACE_NAME_ENV_COMMENTS.has(line) &&
			lines[index + 1]?.startsWith("SUPERSET_WORKSPACE_NAME=")
		) {
			index += 1;
			continue;
		}
		nextLines.push(line);
	}

	while (nextLines.at(-1) === "") nextLines.pop();
	nextLines.push(
		"",
		WORKSPACE_NAME_ENV_COMMENT,
		`SUPERSET_WORKSPACE_NAME="${escapeEnvValue(trimmed)}"`,
	);

	writeFileSync(envPath, `${nextLines.join("\n")}\n`, "utf8");
}

export async function syncWorkspaceNameArtifacts(args: {
	ctx: HostServiceContext;
	workspaceId: string;
	worktreePath: string;
	fallbackWorkspaceName?: string;
}): Promise<{ workspaceName: string; worktreePath: string }> {
	let workspaceName = args.fallbackWorkspaceName;

	try {
		const workspace = await args.ctx.api.v2Workspace.getFromHost.query({
			id: args.workspaceId,
		});
		workspaceName = workspace.name;
	} catch (err) {
		if (!workspaceName) throw err;
		console.warn(
			"[workspace-name-artifacts] failed to read current cloud workspace name",
			err,
		);
	}

	if (!workspaceName) {
		throw new Error("Workspace name is not available");
	}

	writeSetupWorkspaceName(args.worktreePath, workspaceName);
	writeWorkspaceNameToGeneratedEnv(args.worktreePath, workspaceName);

	return { workspaceName, worktreePath: args.worktreePath };
}

function escapeEnvValue(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("$", "\\$")
		.replaceAll("`", "\\`")
		.replaceAll("\n", "\\n");
}
