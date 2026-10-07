const STORAGE_KEY = "chatModeByAgent";
const MAX_AGENTS = 32;

type SavedModes = Record<string, string>;

function readSavedModes(): SavedModes {
	try {
		const parsed: unknown = JSON.parse(
			window.localStorage.getItem(STORAGE_KEY) ?? "{}",
		);
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
			return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		);
	} catch {
		return {};
	}
}

export function withSavedMode(
	saved: SavedModes,
	presetId: string,
	modeId: string,
): SavedModes {
	const { [presetId]: _previous, ...rest } = saved;
	return Object.fromEntries(
		Object.entries({ ...rest, [presetId]: modeId }).slice(-MAX_AGENTS),
	);
}

export function readSavedChatMode(presetId: string): string | undefined {
	return readSavedModes()[presetId];
}

export function saveChatMode(presetId: string, modeId: string): void {
	try {
		window.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify(withSavedMode(readSavedModes(), presetId, modeId)),
		);
	} catch {}
}
