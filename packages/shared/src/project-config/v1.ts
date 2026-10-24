import { stringify } from "smol-toml";
import type { ProjectConfig } from "./schema";

function stringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const strings = value.filter(
		(item): item is string => typeof item === "string",
	);
	return strings.length > 0 ? strings : undefined;
}

/**
 * Translates a v1 `.superset/config.json` object into the v2 shape:
 * setup → [setup], teardown → [archive], run → [terminals.dev] (default
 * locally only, as v1 cloud boot ran only `start`), start → [setup.cloud],
 * ports → [ports.p<number>] with preview.
 */
export function fromV1Json(json: unknown): ProjectConfig {
	const source =
		json && typeof json === "object" && !Array.isArray(json)
			? (json as Record<string, unknown>)
			: {};
	const cwd =
		typeof source.cwd === "string" && source.cwd.trim().length > 0
			? source.cwd.trim()
			: undefined;
	const withCwd = <T extends object>(table: T) =>
		cwd ? { ...table, cwd } : table;

	const config: ProjectConfig = {};
	const setup = stringArray(source.setup);
	const start = stringArray(source.start);
	if (setup || start) {
		config.setup = withCwd({
			...(setup && { run: setup }),
			...(start && { cloud: { run: start } }),
		});
	}
	const teardown = stringArray(source.teardown);
	if (teardown) config.archive = withCwd({ run: teardown });
	const run = stringArray(source.run);
	if (run) {
		config.terminals = {
			dev: withCwd({
				run: run.length === 1 ? (run[0] as string) : run,
				default: true,
				cloud: { default: false },
			}),
		};
	}
	if (Array.isArray(source.ports)) {
		const ports = source.ports.filter(
			(port): port is number =>
				Number.isInteger(port) && port >= 1 && port <= 65535,
		);
		if (ports.length > 0) {
			config.ports = Object.fromEntries(
				ports.map((port) => [`p${port}`, { default: port, preview: true }]),
			);
		}
	}
	return config;
}

export function toTomlText(config: ProjectConfig): string {
	return `${stringify(config).trim()}\n`;
}
