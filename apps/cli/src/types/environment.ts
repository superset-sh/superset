export interface Environment {
	id: string;
}

export interface EnvironmentOrchestrator {
	get: (id: string) => Promise<Environment>;
	list: () => Promise<Environment[]>;
	create: () => Promise<Environment>;
	update: (id: string, environment: Partial<Environment>) => void;

	// Danger
	delete: (id: string) => void;
}
