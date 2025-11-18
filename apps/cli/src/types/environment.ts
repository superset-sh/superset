export interface Environment {
	id: string;
	gitRef: string;
}

export interface EnvironmentOrchestrator {
	get: (id: string) => Promise<Environment>;
	list: () => Promise<Environment[]>;
	create: (gitRef: string) => Promise<Environment>;
	update: (id: string, environment: Partial<Environment>) => void;

	// Danger
	delete: (id: string) => void;
}
