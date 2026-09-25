// Wire shapes returned by the desktop browser bridge. Kept in one place so the
// client and the tRPC router share them rather than re-declaring inline.

export interface BrowserPane {
	paneId: string;
	workspaceId: string | null;
	url: string;
	title: string;
	isLoading: boolean;
}

export interface ConsoleEntry {
	level: string;
	message: string;
	timestamp: number;
}
