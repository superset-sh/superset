import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	buildTerminalEnv,
	FALLBACK_SHELL,
	getLocale,
	removeAppEnvVars,
	SHELL_CRASH_THRESHOLD_MS,
	sanitizeEnv,
} from "./env";

describe("env", () => {
	describe("constants", () => {
		it("should have FALLBACK_SHELL set to /bin/sh on non-Windows", () => {
			// On macOS/Linux, fallback should be /bin/sh
			if (process.platform !== "win32") {
				expect(FALLBACK_SHELL).toBe("/bin/sh");
			}
		});

		it("should have SHELL_CRASH_THRESHOLD_MS set to 1000", () => {
			expect(SHELL_CRASH_THRESHOLD_MS).toBe(1000);
		});
	});

	describe("getLocale", () => {
		it("should return LANG if it contains UTF-8", () => {
			const result = getLocale({ LANG: "en_US.UTF-8" });
			expect(result).toBe("en_US.UTF-8");
		});

		it("should return LC_ALL if LANG is missing but LC_ALL contains UTF-8", () => {
			const result = getLocale({ LC_ALL: "en_GB.UTF-8" });
			expect(result).toBe("en_GB.UTF-8");
		});

		it("should prefer LANG over LC_ALL when both are present", () => {
			const result = getLocale({
				LANG: "fr_FR.UTF-8",
				LC_ALL: "en_US.UTF-8",
			});
			expect(result).toBe("fr_FR.UTF-8");
		});

		it("should return a UTF-8 locale when LANG does not contain UTF-8", () => {
			const result = getLocale({ LANG: "C" });
			expect(result).toContain("UTF-8");
		});

		it("should return a UTF-8 locale when env is empty", () => {
			const result = getLocale({});
			expect(result).toContain("UTF-8");
		});

		it("should handle various UTF-8 locale formats", () => {
			expect(getLocale({ LANG: "de_DE.UTF-8" })).toBe("de_DE.UTF-8");
			expect(getLocale({ LANG: "ja_JP.UTF-8" })).toBe("ja_JP.UTF-8");
			expect(getLocale({ LANG: "zh_CN.UTF-8" })).toBe("zh_CN.UTF-8");
		});
	});

	describe("sanitizeEnv", () => {
		it("should filter out undefined values", () => {
			const env = {
				VALID: "value",
				UNDEFINED: undefined,
			} as NodeJS.ProcessEnv;

			const result = sanitizeEnv(env);

			expect(result).toEqual({ VALID: "value" });
			expect(result).not.toHaveProperty("UNDEFINED");
		});

		it("should return undefined for empty env", () => {
			const result = sanitizeEnv({});
			expect(result).toBeUndefined();
		});

		it("should preserve all string values", () => {
			const env = {
				PATH: "/usr/bin",
				HOME: "/home/user",
				SHELL: "/bin/zsh",
			};

			const result = sanitizeEnv(env);

			expect(result).toEqual(env);
		});

		it("should handle mixed defined and undefined values", () => {
			const env = {
				A: "a",
				B: undefined,
				C: "c",
				D: undefined,
				E: "e",
			} as NodeJS.ProcessEnv;

			const result = sanitizeEnv(env);

			expect(result).toEqual({ A: "a", C: "c", E: "e" });
		});
	});

	describe("removeAppEnvVars", () => {
		describe("behavior-changing Node/Electron vars", () => {
			it("should remove NODE_ENV", () => {
				const env = { NODE_ENV: "production", PATH: "/usr/bin" };
				const result = removeAppEnvVars(env);
				expect(result.NODE_ENV).toBeUndefined();
				expect(result.PATH).toBe("/usr/bin");
			});

			it("should remove NODE_OPTIONS", () => {
				const env = {
					NODE_OPTIONS: "--max-old-space-size=4096",
					PATH: "/usr/bin",
				};
				const result = removeAppEnvVars(env);
				expect(result.NODE_OPTIONS).toBeUndefined();
				expect(result.PATH).toBe("/usr/bin");
			});

			it("should remove NODE_PATH", () => {
				const env = { NODE_PATH: "/custom/modules", PATH: "/usr/bin" };
				const result = removeAppEnvVars(env);
				expect(result.NODE_PATH).toBeUndefined();
				expect(result.PATH).toBe("/usr/bin");
			});

			it("should remove ELECTRON_RUN_AS_NODE", () => {
				const env = { ELECTRON_RUN_AS_NODE: "1", PATH: "/usr/bin" };
				const result = removeAppEnvVars(env);
				expect(result.ELECTRON_RUN_AS_NODE).toBeUndefined();
				expect(result.PATH).toBe("/usr/bin");
			});
		});

		describe("app secrets (exact match)", () => {
			it("should remove GOOGLE_API_KEY", () => {
				const env = { GOOGLE_API_KEY: "secret", PATH: "/usr/bin" };
				const result = removeAppEnvVars(env);
				expect(result.GOOGLE_API_KEY).toBeUndefined();
			});

			it("should remove GOOGLE_CLIENT_ID", () => {
				const env = { GOOGLE_CLIENT_ID: "client-id", PATH: "/usr/bin" };
				const result = removeAppEnvVars(env);
				expect(result.GOOGLE_CLIENT_ID).toBeUndefined();
			});

			it("should remove GH_CLIENT_ID", () => {
				const env = { GH_CLIENT_ID: "gh-client-id", PATH: "/usr/bin" };
				const result = removeAppEnvVars(env);
				expect(result.GH_CLIENT_ID).toBeUndefined();
			});

			it("should remove SENTRY_DSN_DESKTOP", () => {
				const env = {
					SENTRY_DSN_DESKTOP: "https://sentry.io/xxx",
					PATH: "/usr/bin",
				};
				const result = removeAppEnvVars(env);
				expect(result.SENTRY_DSN_DESKTOP).toBeUndefined();
			});
		});

		describe("prefix-based app/build vars", () => {
			it("should remove VITE_* vars", () => {
				const env = {
					VITE_API_URL: "http://localhost",
					VITE_DEBUG: "true",
					PATH: "/usr/bin",
				};
				const result = removeAppEnvVars(env);
				expect(result.VITE_API_URL).toBeUndefined();
				expect(result.VITE_DEBUG).toBeUndefined();
				expect(result.PATH).toBe("/usr/bin");
			});

			it("should remove MAIN_VITE_* vars", () => {
				const env = { MAIN_VITE_KEY: "value", PATH: "/usr/bin" };
				const result = removeAppEnvVars(env);
				expect(result.MAIN_VITE_KEY).toBeUndefined();
			});

			it("should remove NEXT_PUBLIC_* vars", () => {
				const env = {
					NEXT_PUBLIC_API_URL: "https://api.example.com",
					NEXT_PUBLIC_POSTHOG_KEY: "phkey",
					PATH: "/usr/bin",
				};
				const result = removeAppEnvVars(env);
				expect(result.NEXT_PUBLIC_API_URL).toBeUndefined();
				expect(result.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
			});

			it("should remove TURBO_* vars", () => {
				const env = {
					TURBO_TEAM: "team",
					TURBO_TOKEN: "token",
					PATH: "/usr/bin",
				};
				const result = removeAppEnvVars(env);
				expect(result.TURBO_TEAM).toBeUndefined();
				expect(result.TURBO_TOKEN).toBeUndefined();
			});

			it("should remove ELECTRON_VITE_* vars", () => {
				const env = { ELECTRON_VITE_DEV: "true", PATH: "/usr/bin" };
				const result = removeAppEnvVars(env);
				expect(result.ELECTRON_VITE_DEV).toBeUndefined();
			});
		});

		describe("should preserve legitimate user vars", () => {
			it("should preserve PATH, HOME, SHELL, USER", () => {
				const env = {
					PATH: "/usr/bin:/usr/local/bin",
					HOME: "/Users/test",
					SHELL: "/bin/zsh",
					USER: "testuser",
					NODE_ENV: "production", // Should be removed
				};
				const result = removeAppEnvVars(env);
				expect(result.PATH).toBe("/usr/bin:/usr/local/bin");
				expect(result.HOME).toBe("/Users/test");
				expect(result.SHELL).toBe("/bin/zsh");
				expect(result.USER).toBe("testuser");
				expect(result.NODE_ENV).toBeUndefined();
			});

			it("should preserve SSH_AUTH_SOCK (important for git)", () => {
				const env = { SSH_AUTH_SOCK: "/tmp/ssh-agent.sock", PATH: "/usr/bin" };
				const result = removeAppEnvVars(env);
				expect(result.SSH_AUTH_SOCK).toBe("/tmp/ssh-agent.sock");
			});

			it("should preserve language manager vars (NVM, PYENV, etc.)", () => {
				const env = {
					NVM_DIR: "/Users/test/.nvm",
					PYENV_ROOT: "/Users/test/.pyenv",
					RBENV_ROOT: "/Users/test/.rbenv",
					PATH: "/usr/bin",
				};
				const result = removeAppEnvVars(env);
				expect(result.NVM_DIR).toBe("/Users/test/.nvm");
				expect(result.PYENV_ROOT).toBe("/Users/test/.pyenv");
				expect(result.RBENV_ROOT).toBe("/Users/test/.rbenv");
			});

			it("should preserve proxy vars", () => {
				const env = {
					HTTP_PROXY: "http://proxy:8080",
					HTTPS_PROXY: "http://proxy:8080",
					NO_PROXY: "localhost,127.0.0.1",
					PATH: "/usr/bin",
				};
				const result = removeAppEnvVars(env);
				expect(result.HTTP_PROXY).toBe("http://proxy:8080");
				expect(result.HTTPS_PROXY).toBe("http://proxy:8080");
				expect(result.NO_PROXY).toBe("localhost,127.0.0.1");
			});
		});

		it("should not mutate the original env object", () => {
			const env = { NODE_ENV: "production", PATH: "/usr/bin" };
			const result = removeAppEnvVars(env);
			expect(env.NODE_ENV).toBe("production"); // Original unchanged
			expect(result.NODE_ENV).toBeUndefined(); // Result cleaned
		});
	});

	describe("buildTerminalEnv", () => {
		const baseParams = {
			shell: "/bin/zsh",
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
		};

		// Store original env vars to restore after tests
		const originalEnvVars: Record<string, string | undefined> = {};
		const varsToTrack = [
			"NODE_ENV",
			"NODE_OPTIONS",
			"NODE_PATH",
			"ELECTRON_RUN_AS_NODE",
			"GOOGLE_API_KEY",
			"VITE_TEST_VAR",
			"NEXT_PUBLIC_TEST",
		];

		beforeEach(() => {
			// Save original values
			for (const key of varsToTrack) {
				originalEnvVars[key] = process.env[key];
			}
		});

		afterEach(() => {
			// Restore original values
			for (const key of varsToTrack) {
				if (originalEnvVars[key] === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = originalEnvVars[key];
				}
			}
		});

		describe("should not propagate app env vars to terminals", () => {
			it("should remove NODE_ENV from Electron's process.env", () => {
				process.env.NODE_ENV = "production";
				const result = buildTerminalEnv(baseParams);
				expect(result.NODE_ENV).toBeUndefined();
			});

			it("should remove NODE_OPTIONS from Electron's process.env", () => {
				process.env.NODE_OPTIONS = "--inspect";
				const result = buildTerminalEnv(baseParams);
				expect(result.NODE_OPTIONS).toBeUndefined();
			});

			it("should remove VITE_* vars from Electron's process.env", () => {
				process.env.VITE_TEST_VAR = "test-value";
				const result = buildTerminalEnv(baseParams);
				expect(result.VITE_TEST_VAR).toBeUndefined();
			});

			it("should remove NEXT_PUBLIC_* vars from Electron's process.env", () => {
				process.env.NEXT_PUBLIC_TEST = "test-value";
				const result = buildTerminalEnv(baseParams);
				expect(result.NEXT_PUBLIC_TEST).toBeUndefined();
			});

			it("should remove GOOGLE_API_KEY from Electron's process.env", () => {
				process.env.GOOGLE_API_KEY = "secret-key";
				const result = buildTerminalEnv(baseParams);
				expect(result.GOOGLE_API_KEY).toBeUndefined();
			});
		});

		describe("terminal metadata", () => {
			it("should set TERM_PROGRAM to Superset", () => {
				const result = buildTerminalEnv(baseParams);
				expect(result.TERM_PROGRAM).toBe("Superset");
			});

			it("should set COLORTERM to truecolor", () => {
				const result = buildTerminalEnv(baseParams);
				expect(result.COLORTERM).toBe("truecolor");
			});

			it("should set Superset-specific env vars", () => {
				const result = buildTerminalEnv(baseParams);

				expect(result.SUPERSET_PANE_ID).toBe("pane-1");
				expect(result.SUPERSET_TAB_ID).toBe("tab-1");
				expect(result.SUPERSET_WORKSPACE_ID).toBe("ws-1");
			});

			it("should handle optional workspace params", () => {
				const result = buildTerminalEnv({
					...baseParams,
					workspaceName: "my-workspace",
					workspacePath: "/path/to/workspace",
					rootPath: "/root/path",
				});

				expect(result.SUPERSET_WORKSPACE_NAME).toBe("my-workspace");
				expect(result.SUPERSET_WORKSPACE_PATH).toBe("/path/to/workspace");
				expect(result.SUPERSET_ROOT_PATH).toBe("/root/path");
			});

			it("should default optional params to empty string", () => {
				const result = buildTerminalEnv(baseParams);

				expect(result.SUPERSET_WORKSPACE_NAME).toBe("");
				expect(result.SUPERSET_WORKSPACE_PATH).toBe("");
				expect(result.SUPERSET_ROOT_PATH).toBe("");
			});

			it("should set LANG to a UTF-8 locale", () => {
				const result = buildTerminalEnv(baseParams);
				expect(result.LANG).toContain("UTF-8");
			});

			it("should include SUPERSET_PORT", () => {
				const result = buildTerminalEnv(baseParams);
				expect(result.SUPERSET_PORT).toBeDefined();
				expect(typeof result.SUPERSET_PORT).toBe("string");
			});
		});
	});
});
