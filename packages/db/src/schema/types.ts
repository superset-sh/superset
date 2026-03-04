export type LinearConfig = {
	provider: "linear";
	newTasksTeamId?: string;
};

export type SlackConfig = {
	provider: "slack";
};

export type IntegrationConfig = LinearConfig | SlackConfig;
