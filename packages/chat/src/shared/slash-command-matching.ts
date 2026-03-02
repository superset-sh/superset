export interface SlashCommandIdentity {
	name: string;
	aliases: string[];
}

function normalizeSlashCommandName(name: string): string {
	return name.trim().toLowerCase();
}

export function matchesSlashCommandIdentity(
	command: SlashCommandIdentity,
	nameOrAlias: string,
): boolean {
	const target = normalizeSlashCommandName(nameOrAlias);
	if (!target) return false;
	if (normalizeSlashCommandName(command.name) === target) return true;
	return command.aliases.some(
		(alias) => normalizeSlashCommandName(alias) === target,
	);
}

export function findSlashCommandByNameOrAlias<T extends SlashCommandIdentity>(
	commands: T[],
	nameOrAlias: string,
): T | null {
	return (
		commands.find((command) =>
			matchesSlashCommandIdentity(command, nameOrAlias),
		) ?? null
	);
}
