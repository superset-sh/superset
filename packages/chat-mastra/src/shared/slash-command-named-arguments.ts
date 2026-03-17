export interface ParsedNamedSlashArgument {
	keyRaw: string;
	keyUpper: string;
	value: string;
}

export function normalizeSlashNamedArgumentKey(rawKey: string): string {
	return rawKey.replace(/-/g, "_").toUpperCase();
}

export function parseNamedSlashArgumentToken(
	token: string,
): ParsedNamedSlashArgument | null {
	const match = token.match(/^(?:--?)?([A-Za-z_][\w-]*)=(.*)$/);
	if (!match) return null;

	const keyRaw = match[1];
	const value = match[2];
	if (keyRaw === undefined || value === undefined) return null;

	return {
		keyRaw,
		keyUpper: normalizeSlashNamedArgumentKey(keyRaw),
		value,
	};
}
