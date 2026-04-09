export type ActionIconKey =
	| "run"
	| "tool"
	| "debug"
	| "test"
	| "terminal"
	| "sparkles"
	| "bolt"
	| "rocket"
	| "build"
	| "deploy";

export interface WorkspaceAction {
	id: string;
	name: string;
	command: string;
	icon?: ActionIconKey;
}

export interface SetupConfig {
	setup?: string[];
	teardown?: string[];
	run?: string[];
	actions?: WorkspaceAction[];
}

export interface LocalScriptMerge {
	before?: string[];
	after?: string[];
}

export interface LocalSetupConfig {
	setup?: string[] | LocalScriptMerge;
	teardown?: string[] | LocalScriptMerge;
	run?: string[] | LocalScriptMerge;
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
