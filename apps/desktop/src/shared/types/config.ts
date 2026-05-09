export interface SetupConfig {
	setup?: string[];
	teardown?: string[];
	run?: string[];
	/**
	 * Paths (relative to the main repo) to copy from the main worktree into a
	 * newly created workspace. Intended for gitignored files required at
	 * runtime, such as `.env.development` or other local credentials, which
	 * `git worktree add` does not copy by default.
	 */
	copyFiles?: string[];
}

export interface LocalScriptMerge {
	before?: string[];
	after?: string[];
}

export interface LocalSetupConfig {
	setup?: string[] | LocalScriptMerge;
	teardown?: string[] | LocalScriptMerge;
	run?: string[] | LocalScriptMerge;
	copyFiles?: string[] | LocalScriptMerge;
}

export interface SetupAction {
	id: string;
	category:
		| "package-manager"
		| "environment"
		| "infrastructure"
		| "version-manager";
	label: string;
	detail: string;
	command: string;
	enabled: boolean;
}

export interface SetupDetectionResult {
	projectSummary: string;
	actions: SetupAction[];
	setupTemplate: string[];
	signals: Record<string, boolean>;
}
