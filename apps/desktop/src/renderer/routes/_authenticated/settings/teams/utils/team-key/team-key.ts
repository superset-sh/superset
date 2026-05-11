export const TEAM_KEY_MAX_LENGTH = 8;

export function normalizeTeamKey(value: string): string {
	return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidTeamKey(value: string): boolean {
	return /^[A-Z0-9]{3,8}$/.test(value);
}
