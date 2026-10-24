export {
	type ConfigError,
	type ParseProjectConfigResult,
	parseProjectConfig,
} from "./parse";
export {
	getDefaultTerminal,
	type ResolvedPhase,
	type ResolvedPort,
	type ResolvedProjectConfig,
	type ResolvedTerminal,
	resolveProjectConfig,
} from "./resolve";
export {
	CONFIG_NAME_PATTERN,
	type ConfigEnvironment,
	MAX_PREVIEW_PORTS,
	type PhaseName,
	type ProjectConfig,
	projectConfigSchema,
} from "./schema";
export { fromV1Json, toTomlText } from "./v1";

export const PROJECT_CONFIG_DIR = ".superset";
export const PROJECT_CONFIG_FILE = "config.toml";
export const PROJECT_LOCAL_CONFIG_FILE = "config.local.toml";
