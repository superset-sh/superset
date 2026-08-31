export const SIMPLE_GIT_UNSAFE_OPTION_FLAGS = [
	"allowUnsafeAlias",
	"allowUnsafeAskPass",
	"allowUnsafeConfigEnvCount",
	"allowUnsafeConfigPaths",
	"allowUnsafeCredentialHelper",
	"allowUnsafeCustomBinary",
	"allowUnsafeDiffExternal",
	"allowUnsafeDiffTextConv",
	"allowUnsafeEditor",
	"allowUnsafeFilter",
	"allowUnsafeFsMonitor",
	"allowUnsafeGitProxy",
	"allowUnsafeGpgProgram",
	"allowUnsafeHooksPath",
	"allowUnsafeMergeDriver",
	"allowUnsafePack",
	"allowUnsafePager",
	"allowUnsafeProtocolOverride",
	"allowUnsafeSshCommand",
	"allowUnsafeTemplateDir",
] as const;

export type SimpleGitUnsafeOptionFlag =
	(typeof SIMPLE_GIT_UNSAFE_OPTION_FLAGS)[number];

/**
 * Kill a git subprocess that produces no output for this long. simple-git's
 * timeout plugin resets the timer on every stdout/stderr chunk, so healthy
 * commands (which stream progress) are unaffected; only a truly stalled process
 * is terminated — e.g. an unreachable remote or an SSH host-key / credential
 * prompt that can never be answered from a GUI app without a TTY. Without this,
 * such a git call hangs forever and freezes flows like opening a folder (#5898).
 */
export const GIT_COMMAND_BLOCK_TIMEOUT_MS = 15_000;

export const USER_GIT_ENV_SIMPLE_GIT_OPTIONS = {
	unsafe: Object.fromEntries(
		SIMPLE_GIT_UNSAFE_OPTION_FLAGS.map((flag) => [flag, true]),
	),
	timeout: { block: GIT_COMMAND_BLOCK_TIMEOUT_MS },
} as {
	unsafe: Record<SimpleGitUnsafeOptionFlag, true>;
	timeout: { block: number };
};
