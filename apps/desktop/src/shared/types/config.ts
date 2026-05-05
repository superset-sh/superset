export interface SetupConfig {
	setup?: string[];
	teardown?: string[];
	run?: string[];
	copyFiles?: string[];
}

export interface LocalArrayMerge {
	before?: string[];
	after?: string[];
}

export interface LocalSetupConfig {
	setup?: string[] | LocalArrayMerge;
	teardown?: string[] | LocalArrayMerge;
	run?: string[] | LocalArrayMerge;
	copyFiles?: string[] | LocalArrayMerge;
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
