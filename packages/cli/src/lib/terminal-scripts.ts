import { CLIError } from "@superset/cli-framework";
import type { ExecutionMode, TerminalPreset } from "@superset/local-db";
import { readSettingsRow, updateSettingsAtomically } from "./settings";

export interface CreateTerminalScriptInput {
	organizationId: string;
	name: string;
	description?: string;
	cwd?: string;
	commands: string[];
	projectIds?: string[];
	pinnedToBar?: boolean;
	useAsWorkspaceRun?: boolean;
	executionMode?: ExecutionMode;
}

/** Fields `superset scripts edit` can change; undefined leaves a field alone. */
export interface TerminalScriptPatch {
	name?: string;
	description?: string;
	cwd?: string;
	commands?: string[];
	/** `null` makes the script available in every project. */
	projectIds?: string[] | null;
	pinnedToBar?: boolean;
	useAsWorkspaceRun?: boolean;
	executionMode?: ExecutionMode;
}

export type TerminalScriptStatus = "ready" | "importing" | "deleting";

/** A script as the CLI shows it: storage markers replaced by one status. */
export type PublicTerminalScript = Omit<
	TerminalPreset,
	"cliImportPending" | "cliTargetOrganizationId" | "cliDeletePending"
> & { status: TerminalScriptStatus };

function normalizeName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) {
		throw new CLIError("Script name cannot be empty", "Pass --name <name>.");
	}
	return trimmed;
}

function normalizeCommands(commands: string[]): string[] {
	const trimmed = commands.map((command) => command.trim());
	if (trimmed.length === 0 || trimmed.some((command) => !command)) {
		throw new CLIError(
			"Script commands cannot be empty",
			"Pass one or more non-empty --command values.",
		);
	}
	return trimmed;
}

function normalizeProjectIds(
	projectIds: string[] | null | undefined,
): string[] | null {
	return projectIds && projectIds.length > 0 ? [...new Set(projectIds)] : null;
}

export function getTerminalScriptStatus(
	script: TerminalPreset,
): TerminalScriptStatus {
	if (script.cliDeletePending) return "deleting";
	if (script.cliImportPending) return "importing";
	return "ready";
}

export function toPublicTerminalScript(
	script: TerminalPreset,
): PublicTerminalScript {
	const {
		cliImportPending: _pending,
		cliTargetOrganizationId: _target,
		cliDeletePending: _deleting,
		...rest
	} = script;
	return { ...rest, status: getTerminalScriptStatus(script) };
}

/**
 * Every script in the desktop's shared local store — the ones the CLI added
 * plus any the app wrote there itself. Scripts created in the desktop's v2
 * Settings live only in the app and are not visible here.
 */
export function listTerminalScripts(): TerminalPreset[] {
	return readSettingsRow()?.terminalPresets ?? [];
}

/** Scripts still visible to the user: delete tombstones excluded. */
function liveScripts(scripts: TerminalPreset[]): TerminalPreset[] {
	return scripts.filter((script) => !script.cliDeletePending);
}

function requireScript(
	scripts: TerminalPreset[],
	id: string,
): { index: number; script: TerminalPreset } {
	const index = scripts.findIndex((script) => script.id === id);
	const script = scripts[index];
	if (!script) {
		throw new CLIError(
			`Terminal script ${id} not found`,
			"Run `superset scripts list` to see script ids.",
		);
	}
	return { index, script };
}

/**
 * Persist a user-authored terminal script in the desktop's legacy-compatible
 * terminal_presets field. "Preset" remains the storage/API term so current
 * and older desktop builds can read scripts created by the CLI.
 */
export function createTerminalScript(
	input: CreateTerminalScriptInput,
): TerminalPreset {
	const name = normalizeName(input.name);
	const commands = normalizeCommands(input.commands);
	const script: TerminalPreset = {
		id: crypto.randomUUID(),
		name,
		description: input.description?.trim() || undefined,
		cwd: input.cwd?.trim() ?? "",
		commands,
		projectIds: normalizeProjectIds(input.projectIds),
		pinnedToBar: input.pinnedToBar ?? true,
		useAsWorkspaceRun: input.useAsWorkspaceRun || undefined,
		executionMode: input.executionMode ?? "new-tab",
		cliImportPending: true,
		cliTargetOrganizationId: input.organizationId,
	};

	return updateSettingsAtomically((row) => ({
		patch: { terminalPresets: [...(row?.terminalPresets ?? []), script] },
		result: script,
	}));
}

/**
 * Change fields on an existing script and re-flag it for import, so the
 * desktop app updates its copy in place (keeping bar position) instead of
 * adding a duplicate.
 */
export function updateTerminalScript({
	organizationId,
	id,
	patch,
}: {
	organizationId: string;
	id: string;
	patch: TerminalScriptPatch;
}): TerminalPreset {
	const name = patch.name === undefined ? undefined : normalizeName(patch.name);
	const commands =
		patch.commands === undefined
			? undefined
			: normalizeCommands(patch.commands);

	return updateSettingsAtomically((row) => {
		const scripts = row?.terminalPresets ?? [];
		const { index, script } = requireScript(scripts, id);
		if (script.cliDeletePending) {
			throw new CLIError(
				`Terminal script ${id} is scheduled for deletion`,
				"Add it again with `superset scripts add`.",
			);
		}
		const updated: TerminalPreset = {
			...script,
			name: name ?? script.name,
			description:
				patch.description === undefined
					? script.description
					: patch.description.trim() || undefined,
			cwd: patch.cwd === undefined ? script.cwd : patch.cwd.trim(),
			commands: commands ?? script.commands,
			projectIds:
				patch.projectIds === undefined
					? (script.projectIds ?? null)
					: normalizeProjectIds(patch.projectIds),
			pinnedToBar: patch.pinnedToBar ?? script.pinnedToBar ?? true,
			useAsWorkspaceRun:
				(patch.useAsWorkspaceRun ?? script.useAsWorkspaceRun) || undefined,
			executionMode: patch.executionMode ?? script.executionMode ?? "new-tab",
			cliImportPending: true,
			cliTargetOrganizationId: organizationId,
		};
		const next = [...scripts];
		next[index] = updated;
		return { patch: { terminalPresets: next }, result: updated };
	});
}

/**
 * Remove a script. The row always stays as a tombstone until the desktop app
 * has deleted its copy and drops the row (see cliDeletePending): an
 * import-pending marker cannot tell a never-imported script from one being
 * edited, and even a fresh add may already be copied but not yet acknowledged.
 */
export function deleteTerminalScript({
	organizationId,
	id,
}: {
	organizationId: string;
	id: string;
}): TerminalPreset {
	return updateSettingsAtomically((row) => {
		const scripts = row?.terminalPresets ?? [];
		const { index, script } = requireScript(scripts, id);
		if (script.cliDeletePending) {
			return { patch: { terminalPresets: scripts }, result: script };
		}
		const {
			cliImportPending: _pending,
			cliTargetOrganizationId: _target,
			...rest
		} = script;
		const tombstone: TerminalPreset = {
			...rest,
			cliDeletePending: true,
			cliTargetOrganizationId: organizationId,
		};
		const next = [...scripts];
		next[index] = tombstone;
		return { patch: { terminalPresets: next }, result: tombstone };
	});
}

/**
 * Exact-name lookup for `scripts add --upsert`. Throws when the name is
 * ambiguous: silently picking one would edit the wrong script.
 */
export function findTerminalScriptByName(
	name: string,
): TerminalPreset | undefined {
	const target = normalizeName(name);
	const matches = liveScripts(listTerminalScripts()).filter(
		(script) => script.name === target,
	);
	if (matches.length > 1) {
		throw new CLIError(
			`${matches.length} scripts are named ${target}: ${matches
				.map((script) => script.id)
				.join(", ")}`,
			"Delete the extras with `superset scripts delete <id>`, then retry.",
		);
	}
	return matches[0];
}
