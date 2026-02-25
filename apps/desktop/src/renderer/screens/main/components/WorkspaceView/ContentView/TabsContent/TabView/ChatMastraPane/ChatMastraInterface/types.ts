export interface ChatMastraInterfaceProps {
	sessionId: string | null;
	workspaceId: string;
	cwd: string;
	onStartFreshSession: () => Promise<{
		created: boolean;
		errorMessage?: string;
	}>;
}
