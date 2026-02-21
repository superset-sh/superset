export interface DataResolver {
	resolveCwd(sessionId: string): Promise<string>;
	buildTaskMentionContext(slugs: string[]): Promise<string>;
}
