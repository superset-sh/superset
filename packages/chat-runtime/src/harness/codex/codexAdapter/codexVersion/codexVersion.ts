export const MIN_CODEX_VERSION = "0.143.0";

export function parseCodexVersion(userAgent: string): string | null {
	const match = userAgent.match(/^[^/\s]+\/(\d+\.\d+\.\d+)/);
	return match?.[1] ?? null;
}

export function meetsMinimumVersion(
	version: string | null,
	minimum: string,
): boolean {
	if (!version) return false;
	const actual = version.split(".").map(Number);
	const required = minimum.split(".").map(Number);
	for (let index = 0; index < required.length; index += 1) {
		const left = actual[index] ?? 0;
		const right = required[index] ?? 0;
		if (left > right) return true;
		if (left < right) return false;
	}
	return true;
}
