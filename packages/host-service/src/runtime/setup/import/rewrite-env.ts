const VARIABLE_EQUIVALENTS: Record<string, string> = {
	CONDUCTOR_ROOT_PATH: "SUPERSET_ROOT_PATH",
	CONDUCTOR_WORKSPACE_PATH: "SUPERSET_WORKSPACE_PATH",
	CONDUCTOR_WORKSPACE_NAME: "SUPERSET_WORKSPACE_NAME",
	ORCA_ROOT_PATH: "SUPERSET_ROOT_PATH",
	GHOSTX_ROOT_PATH: "SUPERSET_ROOT_PATH",
	ORCA_WORKTREE_PATH: "SUPERSET_WORKSPACE_PATH",
	ORCA_WORKSPACE_NAME: "SUPERSET_WORKSPACE_NAME",
	T3CODE_PROJECT_ROOT: "SUPERSET_ROOT_PATH",
	T3CODE_WORKTREE_PATH: "SUPERSET_WORKSPACE_PATH",
};

const TOOL_VARIABLE_PATTERN =
	/\$(\{?)((?:CONDUCTOR|ORCA|GHOSTX|T3CODE|CODEX|CMUX)_[A-Z0-9_]+)(?![A-Za-z0-9_])/g;

/** Renames the other tool's `$VAR` and `${VAR}` references to Superset's. */
export function rewriteToolVariables(script: string): {
	script: string;
	unsupported: string[];
} {
	const unsupported = new Set<string>();
	const rewritten = script.replace(
		TOOL_VARIABLE_PATTERN,
		(match, brace: string, name: string) => {
			const equivalent = VARIABLE_EQUIVALENTS[name];
			if (!equivalent) {
				unsupported.add(name);
				return match;
			}
			return `$${brace}${equivalent}`;
		},
	);
	return { script: rewritten, unsupported: [...unsupported] };
}
