import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	buildSafeEnv,
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

	describe("buildSafeEnv", () => {
		describe("excludes unknown/dangerous vars (allowlist approach)", () => {
			it("should exclude NODE_ENV (not in allowlist)", () => {
				const env = { NODE_ENV: "production", PATH: "/usr/bin" };
				const result = buildSafeEnv(env);
				expect(result.NODE_ENV).toBeUndefined();
				expect(result.PATH).toBe("/usr/bin");
			});

			it("should exclude NODE_OPTIONS (not in allowlist)", () => {
				const env = {
					NODE_OPTIONS: "--max-old-space-size=4096",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.NODE_OPTIONS).toBeUndefined();
				expect(result.PATH).toBe("/usr/bin");
			});

			it("should exclude NODE_PATH (not in allowlist)", () => {
				const env = { NODE_PATH: "/custom/modules", PATH: "/usr/bin" };
				const result = buildSafeEnv(env);
				expect(result.NODE_PATH).toBeUndefined();
				expect(result.PATH).toBe("/usr/bin");
			});

			it("should exclude ELECTRON_RUN_AS_NODE (not in allowlist)", () => {
				const env = { ELECTRON_RUN_AS_NODE: "1", PATH: "/usr/bin" };
				const result = buildSafeEnv(env);
				expect(result.ELECTRON_RUN_AS_NODE).toBeUndefined();
				expect(result.PATH).toBe("/usr/bin");
			});
		});

		describe("excludes secrets (not in allowlist)", () => {
			it("should exclude GOOGLE_API_KEY", () => {
				const env = { GOOGLE_API_KEY: "secret", PATH: "/usr/bin" };
				const result = buildSafeEnv(env);
				expect(result.GOOGLE_API_KEY).toBeUndefined();
			});

			it("should exclude DATABASE_URL", () => {
				const env = {
					DATABASE_URL: "postgres://user:pass@host/db",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.DATABASE_URL).toBeUndefined();
			});

			it("should exclude CLERK_SECRET_KEY", () => {
				const env = { CLERK_SECRET_KEY: "sk_test_xxx", PATH: "/usr/bin" };
				const result = buildSafeEnv(env);
				expect(result.CLERK_SECRET_KEY).toBeUndefined();
			});

			it("should exclude NEON_API_KEY", () => {
				const env = { NEON_API_KEY: "neon-api-key", PATH: "/usr/bin" };
				const result = buildSafeEnv(env);
				expect(result.NEON_API_KEY).toBeUndefined();
			});

			it("should exclude SENTRY_AUTH_TOKEN", () => {
				const env = { SENTRY_AUTH_TOKEN: "sentry-token", PATH: "/usr/bin" };
				const result = buildSafeEnv(env);
				expect(result.SENTRY_AUTH_TOKEN).toBeUndefined();
			});

			it("should exclude GH_CLIENT_SECRET", () => {
				const env = { GH_CLIENT_SECRET: "gh-secret", PATH: "/usr/bin" };
				const result = buildSafeEnv(env);
				expect(result.GH_CLIENT_SECRET).toBeUndefined();
			});
		});

		describe("excludes app/build-time vars (not in allowlist)", () => {
			it("should exclude VITE_* vars", () => {
				const env = {
					VITE_API_URL: "http://localhost",
					VITE_DEBUG: "true",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.VITE_API_URL).toBeUndefined();
				expect(result.VITE_DEBUG).toBeUndefined();
				expect(result.PATH).toBe("/usr/bin");
			});

			it("should exclude NEXT_PUBLIC_* vars", () => {
				const env = {
					NEXT_PUBLIC_API_URL: "https://api.example.com",
					NEXT_PUBLIC_POSTHOG_KEY: "phkey",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.NEXT_PUBLIC_API_URL).toBeUndefined();
				expect(result.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
			});

			it("should exclude TURBO_* vars", () => {
				const env = {
					TURBO_TEAM: "team",
					TURBO_TOKEN: "token",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.TURBO_TEAM).toBeUndefined();
				expect(result.TURBO_TOKEN).toBeUndefined();
			});
		});

		describe("includes allowlisted shell environment vars", () => {
			it("should include PATH, HOME, SHELL, USER", () => {
				const env = {
					PATH: "/usr/bin:/usr/local/bin",
					HOME: "/Users/test",
					SHELL: "/bin/zsh",
					USER: "testuser",
					NODE_ENV: "production", // Should be excluded
				};
				const result = buildSafeEnv(env);
				expect(result.PATH).toBe("/usr/bin:/usr/local/bin");
				expect(result.HOME).toBe("/Users/test");
				expect(result.SHELL).toBe("/bin/zsh");
				expect(result.USER).toBe("testuser");
				expect(result.NODE_ENV).toBeUndefined();
			});

			it("should include SSH_AUTH_SOCK (critical for git)", () => {
				const env = { SSH_AUTH_SOCK: "/tmp/ssh-agent.sock", PATH: "/usr/bin" };
				const result = buildSafeEnv(env);
				expect(result.SSH_AUTH_SOCK).toBe("/tmp/ssh-agent.sock");
			});

			it("should include SSH_AGENT_PID", () => {
				const env = { SSH_AGENT_PID: "12345", PATH: "/usr/bin" };
				const result = buildSafeEnv(env);
				expect(result.SSH_AGENT_PID).toBe("12345");
			});

			it("should include language manager vars (NVM, PYENV, etc.)", () => {
				const env = {
					NVM_DIR: "/Users/test/.nvm",
					PYENV_ROOT: "/Users/test/.pyenv",
					RBENV_ROOT: "/Users/test/.rbenv",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.NVM_DIR).toBe("/Users/test/.nvm");
				expect(result.PYENV_ROOT).toBe("/Users/test/.pyenv");
				expect(result.RBENV_ROOT).toBe("/Users/test/.rbenv");
			});

			it("should include proxy vars (both cases)", () => {
				const env = {
					HTTP_PROXY: "http://proxy:8080",
					HTTPS_PROXY: "http://proxy:8080",
					http_proxy: "http://proxy:8080",
					https_proxy: "http://proxy:8080",
					NO_PROXY: "localhost,127.0.0.1",
					no_proxy: "localhost",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.HTTP_PROXY).toBe("http://proxy:8080");
				expect(result.HTTPS_PROXY).toBe("http://proxy:8080");
				expect(result.http_proxy).toBe("http://proxy:8080");
				expect(result.https_proxy).toBe("http://proxy:8080");
				expect(result.NO_PROXY).toBe("localhost,127.0.0.1");
				expect(result.no_proxy).toBe("localhost");
			});

			it("should include locale vars", () => {
				const env = {
					LANG: "en_US.UTF-8",
					LC_ALL: "en_US.UTF-8",
					LC_CTYPE: "UTF-8",
					TZ: "America/New_York",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.LANG).toBe("en_US.UTF-8");
				expect(result.LC_ALL).toBe("en_US.UTF-8");
				expect(result.LC_CTYPE).toBe("UTF-8");
				expect(result.TZ).toBe("America/New_York");
			});

			it("should include XDG directories", () => {
				const env = {
					XDG_CONFIG_HOME: "/home/user/.config",
					XDG_DATA_HOME: "/home/user/.local/share",
					XDG_CACHE_HOME: "/home/user/.cache",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.XDG_CONFIG_HOME).toBe("/home/user/.config");
				expect(result.XDG_DATA_HOME).toBe("/home/user/.local/share");
				expect(result.XDG_CACHE_HOME).toBe("/home/user/.cache");
			});

			it("should include editor vars", () => {
				const env = {
					EDITOR: "vim",
					VISUAL: "code",
					PAGER: "less",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.EDITOR).toBe("vim");
				expect(result.VISUAL).toBe("code");
				expect(result.PAGER).toBe("less");
			});

			it("should include Homebrew vars", () => {
				const env = {
					HOMEBREW_PREFIX: "/opt/homebrew",
					HOMEBREW_CELLAR: "/opt/homebrew/Cellar",
					HOMEBREW_REPOSITORY: "/opt/homebrew",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.HOMEBREW_PREFIX).toBe("/opt/homebrew");
				expect(result.HOMEBREW_CELLAR).toBe("/opt/homebrew/Cellar");
				expect(result.HOMEBREW_REPOSITORY).toBe("/opt/homebrew");
			});

			it("should include Go/Rust/Deno/Bun paths", () => {
				const env = {
					GOPATH: "/Users/test/go",
					GOROOT: "/usr/local/go",
					CARGO_HOME: "/Users/test/.cargo",
					RUSTUP_HOME: "/Users/test/.rustup",
					DENO_DIR: "/Users/test/.deno",
					BUN_INSTALL: "/Users/test/.bun",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.GOPATH).toBe("/Users/test/go");
				expect(result.GOROOT).toBe("/usr/local/go");
				expect(result.CARGO_HOME).toBe("/Users/test/.cargo");
				expect(result.RUSTUP_HOME).toBe("/Users/test/.rustup");
				expect(result.DENO_DIR).toBe("/Users/test/.deno");
				expect(result.BUN_INSTALL).toBe("/Users/test/.bun");
			});
		});

		describe("includes SUPERSET_* prefix vars", () => {
			it("should include SUPERSET_* vars (our metadata)", () => {
				const env = {
					SUPERSET_PANE_ID: "pane-1",
					SUPERSET_TAB_ID: "tab-1",
					SUPERSET_WORKSPACE_ID: "ws-1",
					PATH: "/usr/bin",
				};
				const result = buildSafeEnv(env);
				expect(result.SUPERSET_PANE_ID).toBe("pane-1");
				expect(result.SUPERSET_TAB_ID).toBe("tab-1");
				expect(result.SUPERSET_WORKSPACE_ID).toBe("ws-1");
			});
		});

		it("should not mutate the original env object", () => {
			const env = { NODE_ENV: "production", PATH: "/usr/bin" };
			const result = buildSafeEnv(env);
			expect(env.NODE_ENV).toBe("production"); // Original unchanged
			expect(result.NODE_ENV).toBeUndefined(); // Result excludes it
		});

		it("should return empty object for env with no allowlisted vars", () => {
			const env = {
				SECRET_KEY: "secret",
				DATABASE_URL: "postgres://...",
				API_TOKEN: "token",
			};
			const result = buildSafeEnv(env);
			expect(Object.keys(result).length).toBe(0);
		});
	});

	describe("removeAppEnvVars (deprecated wrapper)", () => {
		it("should delegate to buildSafeEnv", () => {
			const env = { NODE_ENV: "production", PATH: "/usr/bin" };
			const result = removeAppEnvVars(env);
			expect(result.NODE_ENV).toBeUndefined();
			expect(result.PATH).toBe("/usr/bin");
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
			"DATABASE_URL",
			"CLERK_SECRET_KEY",
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

		describe("excludes non-allowlisted vars from terminals", () => {
			it("should exclude NODE_ENV from Electron's process.env", () => {
				process.env.NODE_ENV = "production";
				const result = buildTerminalEnv(baseParams);
				expect(result.NODE_ENV).toBeUndefined();
			});

			it("should exclude NODE_OPTIONS from Electron's process.env", () => {
				process.env.NODE_OPTIONS = "--inspect";
				const result = buildTerminalEnv(baseParams);
				expect(result.NODE_OPTIONS).toBeUndefined();
			});

			it("should exclude VITE_* vars from Electron's process.env", () => {
				process.env.VITE_TEST_VAR = "test-value";
				const result = buildTerminalEnv(baseParams);
				expect(result.VITE_TEST_VAR).toBeUndefined();
			});

			it("should exclude NEXT_PUBLIC_* vars from Electron's process.env", () => {
				process.env.NEXT_PUBLIC_TEST = "test-value";
				const result = buildTerminalEnv(baseParams);
				expect(result.NEXT_PUBLIC_TEST).toBeUndefined();
			});

			it("should exclude GOOGLE_API_KEY from Electron's process.env", () => {
				process.env.GOOGLE_API_KEY = "secret-key";
				const result = buildTerminalEnv(baseParams);
				expect(result.GOOGLE_API_KEY).toBeUndefined();
			});

			it("should exclude DATABASE_URL from Electron's process.env", () => {
				process.env.DATABASE_URL = "postgres://user:pass@host/db";
				const result = buildTerminalEnv(baseParams);
				expect(result.DATABASE_URL).toBeUndefined();
			});

			it("should exclude CLERK_SECRET_KEY from Electron's process.env", () => {
				process.env.CLERK_SECRET_KEY = "sk_test_xxx";
				const result = buildTerminalEnv(baseParams);
				expect(result.CLERK_SECRET_KEY).toBeUndefined();
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
