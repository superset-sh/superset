import { observable } from "@trpc/server/observable";
import * as electron from "electron";
import { publicProcedure, router } from "..";
import { execWithShellEnv } from "./workspaces/utils/shell-env";

export type SystemThemeType = "dark" | "light";

interface NativeThemeSource {
	readonly shouldUseDarkColors: boolean;
	on(event: "updated", listener: () => void): unknown;
	off(event: "updated", listener: () => void): unknown;
}

interface SystemPreferencesSource {
	getUserDefault(key: string, type: "string"): unknown;
}

export interface SystemThemeDependencies {
	nativeTheme?: NativeThemeSource;
	systemPreferences?: SystemPreferencesSource;
	platform?: NodeJS.Platform;
}

/**
 * Resolve the OS appearance in the Electron main process.
 *
 * `nativeTheme` is the primary source on every platform. macOS can report
 * a stale light value during app startup, so a read-only AppleInterfaceStyle
 * lookup is used only as a dark-mode fallback. The fallback is deliberately
 * guarded because getUserDefault is macOS-only and can throw in restricted
 * environments.
 */
export function getSystemThemeType({
	nativeTheme = electron.nativeTheme,
	systemPreferences = electron.systemPreferences,
	platform = process.platform,
}: SystemThemeDependencies = {}): SystemThemeType {
	if (nativeTheme?.shouldUseDarkColors) {
		return "dark";
	}

	if (platform !== "darwin") {
		return "light";
	}

	try {
		const interfaceStyle = systemPreferences?.getUserDefault(
			"AppleInterfaceStyle",
			"string",
		);
		if (
			typeof interfaceStyle === "string" &&
			interfaceStyle.trim().toLowerCase() === "dark"
		) {
			return "dark";
		}
	} catch {
		// Fall through to the nativeTheme light result.
	}

	return "light";
}

/**
 * Subscribe to main-process appearance changes and immediately prime the
 * listener with the current value. Registering before the first read avoids a
 * missed update between snapshot and subscription setup.
 */
export function observeSystemThemeType(
	listener: (themeType: SystemThemeType) => void,
	dependencies: SystemThemeDependencies = {},
): () => void {
	const nativeTheme = dependencies.nativeTheme ?? electron.nativeTheme;
	const handleUpdated = () => listener(getSystemThemeType(dependencies));

	nativeTheme?.on("updated", handleUpdated);
	listener(getSystemThemeType(dependencies));

	return () => {
		nativeTheme?.off("updated", handleUpdated);
	};
}

interface GhDetectResult {
	installed: boolean;
	authenticated: boolean;
	version: string | null;
	path: string | null;
}

async function detectGhCli(): Promise<GhDetectResult> {
	// Resolve `gh` via the user's login-shell PATH (execWithShellEnv retries with
	// the derived shell env on ENOENT), so we find it wherever it's installed —
	// homebrew, MacPorts, nix, asdf, etc. — not just a hardcoded path list.
	let version: string | null = null;
	try {
		const { stdout } = await execWithShellEnv("gh", ["--version"], {
			timeout: 5000,
		});
		const firstLine = stdout.split("\n")[0]?.trim() ?? "";
		version = firstLine.match(/gh version (\S+)/)?.[1] ?? null;
	} catch {
		return {
			installed: false,
			authenticated: false,
			version: null,
			path: null,
		};
	}

	let authenticated = false;
	try {
		await execWithShellEnv(
			"gh",
			["auth", "status", "--active", "--hostname", "github.com"],
			{ timeout: 5000 },
		);
		authenticated = true;
	} catch {
		// `gh auth status` exits non-zero when not logged in.
	}

	return { installed: true, authenticated, version, path: "gh" };
}

export const createSystemRouter = () => {
	return router({
		detectGhCli: publicProcedure.query(detectGhCli),
		themePreference: publicProcedure.subscription(() => {
			return observable<SystemThemeType>((emit) => {
				return observeSystemThemeType((themeType) => emit.next(themeType));
			});
		}),
	});
};

export type SystemRouter = ReturnType<typeof createSystemRouter>;
