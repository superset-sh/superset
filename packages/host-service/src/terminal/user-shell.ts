import os from "node:os";

type ShellEnvSource = Record<string, string | undefined>;

export interface ResolveConfiguredShellOptions {
	platform?: NodeJS.Platform;
	/**
	 * Test override. `undefined` probes the OS account; `null` simulates an
	 * unavailable account shell and falls back to env.
	 */
	accountShell?: string | null;
}

function normalizeShellPath(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

export function getAccountShell(
	platform: NodeJS.Platform = process.platform,
): string | null {
	if (platform === "win32") return null;

	try {
		const shell = (os.userInfo() as { shell?: unknown }).shell;
		return normalizeShellPath(shell);
	} catch {
		return null;
	}
}

let accountShellForTesting: string | null | undefined;

export function __setAccountShellForTesting(
	shell: string | null | undefined,
): void {
	accountShellForTesting = shell;
}

/**
 * Resolve the shell Superset should launch for user terminals.
 *
 * Desktop-launched helper processes can inherit a generic SHELL such as
 * /bin/bash even when the user's configured login shell is fish. Prefer the
 * OS account shell to match normal terminal-app behavior and the old v1 path.
 */
export function resolveConfiguredShell(
	env: ShellEnvSource,
	options: ResolveConfiguredShellOptions = {},
): string {
	const platform = options.platform ?? process.platform;

	if (platform === "win32") {
		return normalizeShellPath(env.COMSPEC) ?? "cmd.exe";
	}

	const accountShell =
		options.accountShell === undefined
			? accountShellForTesting === undefined
				? getAccountShell(platform)
				: normalizeShellPath(accountShellForTesting)
			: normalizeShellPath(options.accountShell);

	return accountShell ?? normalizeShellPath(env.SHELL) ?? "/bin/sh";
}
