const HOST_STARTS_CHATS_VERSION = "1.37.0";

function parseVersion(value: string): number[] | null {
	const parts = value.trim().split("-")[0]?.split(".") ?? [];
	if (parts.length < 3) return null;
	const numbers = parts.slice(0, 3).map(Number);
	return numbers.some(Number.isNaN) ? null : numbers;
}

/**
 * Whether the host starts a chat itself from an `agents` entry with
 * `surface: "chat"`. An older host ignores `surface` and starts a terminal,
 * so an unknown version answers no.
 */
export function hostStartsChats(version: string | null | undefined): boolean {
	const actual = version ? parseVersion(version) : null;
	const floor = parseVersion(HOST_STARTS_CHATS_VERSION);
	if (!actual || !floor) return false;
	for (let index = 0; index < 3; index++) {
		const a = actual[index] ?? 0;
		const b = floor[index] ?? 0;
		if (a !== b) return a > b;
	}
	return true;
}
