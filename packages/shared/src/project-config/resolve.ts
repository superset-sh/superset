import type {
	CommandValue,
	ConfigEnvironment,
	PhaseName,
	ProjectConfig,
} from "./schema";

export interface ResolvedPhase {
	commands: string[];
	cwd?: string;
}

export interface ResolvedTerminal {
	name: string;
	commands: string[];
	default: boolean;
	cwd?: string;
}

export interface ResolvedPort {
	name: string;
	default: number;
	label: string;
	preview: boolean;
}

export interface ResolvedProjectConfig {
	install: ResolvedPhase;
	setup: ResolvedPhase;
	archive: ResolvedPhase;
	terminals: ResolvedTerminal[];
	ports: ResolvedPort[];
}

interface Fields {
	run?: CommandValue;
	cwd?: string;
	default?: boolean;
}

const PHASES: PhaseName[] = ["install", "setup", "archive"];

function toCommands(run: CommandValue | undefined): string[] {
	if (run === undefined) return [];
	return (Array.isArray(run) ? run : [run]).filter(
		(command) => command.trim().length > 0,
	);
}

/** Fields of one table as seen in an environment: the table, then its environment table. */
function fieldsIn(
	table: (Fields & { cloud?: Fields; local?: Fields }) | undefined,
	environment: ConfigEnvironment,
): Fields | undefined {
	if (!table) return undefined;
	const { cloud, local, ...shared } = table;
	return { ...shared, ...(environment === "cloud" ? cloud : local) };
}

function mergeFields(layers: Array<Fields | undefined>): Fields {
	return Object.assign({}, ...layers);
}

/**
 * Layers merge key by key; a value a later layer sets, arrays included,
 * replaces the earlier one. The personal file applies only locally.
 */
export function resolveProjectConfig({
	base,
	local,
	environment,
}: {
	base: ProjectConfig;
	local: ProjectConfig | null;
	environment: ConfigEnvironment;
}): ResolvedProjectConfig {
	const layers = environment === "local" && local ? [base, local] : [base];

	const phase = (name: PhaseName): ResolvedPhase => {
		const fields = mergeFields(
			layers.map((layer) => fieldsIn(layer[name], environment)),
		);
		return { commands: toCommands(fields.run), cwd: fields.cwd };
	};

	const terminalNames = [
		...new Set(layers.flatMap((layer) => Object.keys(layer.terminals ?? {}))),
	];
	const terminals = terminalNames.map((name) => {
		const fields = mergeFields(
			layers.map((layer) => fieldsIn(layer.terminals?.[name], environment)),
		);
		return {
			name,
			commands: toCommands(fields.run),
			default: fields.default ?? false,
			cwd: fields.cwd,
		};
	});

	const portNames = [
		...new Set(layers.flatMap((layer) => Object.keys(layer.ports ?? {}))),
	];
	const ports = portNames.flatMap((name) => {
		const port: Partial<NonNullable<ProjectConfig["ports"]>[string]> =
			Object.assign({}, ...layers.map((layer) => layer.ports?.[name]));
		if (port.default === undefined) return [];
		return [
			{
				name,
				default: port.default,
				label: port.label ?? name,
				preview: port.preview ?? false,
			},
		];
	});

	const [install, setup, archive] = PHASES.map(phase) as [
		ResolvedPhase,
		ResolvedPhase,
		ResolvedPhase,
	];
	return { install, setup, archive, terminals, ports };
}

/** The terminal the Run button starts: the first `default = true` one with commands. */
export function getDefaultTerminal(
	resolved: ResolvedProjectConfig,
): ResolvedTerminal | null {
	return (
		resolved.terminals.find(
			(terminal) => terminal.default && terminal.commands.length > 0,
		) ?? null
	);
}
