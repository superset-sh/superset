// Option builders

export type { CLIConfig } from "./cli";
// CLI entry point
export { cli } from "./cli";
export type { CommandConfig, CommandResult } from "./command";
// Command definition
export { command } from "./command";
// Errors
export { CLIError, suggestSimilar } from "./errors";
export type { CommandNode } from "./help";
export {
	generateCommandHelp,
	generateGroupHelp,
	generateRootHelp,
} from "./help";
export type { MiddlewareExport, MiddlewareFn } from "./middleware";
// Middleware
export { middleware, skip } from "./middleware";
export type {
	GenericBuilderInternals,
	ProcessedBuilderConfig,
	TypeOf,
} from "./option";
export { boolean, number, positional, string } from "./option";
// Output utilities
export { formatOutput, table } from "./output";
export { camelToKebab, isAgentMode, parseArgv } from "./parser";
// Router utilities (for static/compiled mode)
export {
	buildStaticTree,
	resolveStaticMiddleware,
	routeCommand,
} from "./router";
