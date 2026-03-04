export interface SetupConfig {
	setup?: string[];
	teardown?: string[];
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
