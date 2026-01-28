export type LinearConfig = {
	provider: "linear";
	newTasksTeamId?: string;
};

export type SlackConfig = {
	provider: "slack";
	botUserId: string;
	defaultChannelId?: string;
};

export type IntegrationConfig = LinearConfig | SlackConfig;
