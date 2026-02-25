export interface ChatMastraInterfaceProps {
	sessionId: string | null;
	organizationId: string | null;
	workspaceId: string;
	cwd: string;
	onStartFreshSession: () => Promise<{
		created: boolean;
		errorMessage?: string;
	}>;
}
