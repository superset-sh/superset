export interface McpContext {
	userId: string;
	organizationId: string;
	source?: "slack" | "desktop" | "api" | "external";
}
