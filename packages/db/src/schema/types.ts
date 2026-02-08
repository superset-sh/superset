export type LinearConfig = {
	provider: "linear";
	newTasksTeamId?: string;
};

export type SlackConfig = {
	provider: "slack";
};

export type GithubConfig = {
	provider: "github";
	syncIssues?: boolean;
};

export type IntegrationConfig = LinearConfig | SlackConfig | GithubConfig;
