const STORAGE_KEY = "chatLastAgent";

export function readLastChatAgent(): string | undefined {
	try {
		return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
	} catch {
		return undefined;
	}
}

export function saveLastChatAgent(presetId: string): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, presetId);
	} catch {}
}
