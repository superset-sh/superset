import { describe, expect, it } from "bun:test";
import {
	buildTerminalEnv,
	FALLBACK_SHELL,
	getLocale,
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

	describe("buildTerminalEnv", () => {
		const baseParams = {
			shell: "/bin/zsh",
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
		};

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

		it("should remove GOOGLE_API_KEY for security", () => {
			// Temporarily set GOOGLE_API_KEY
			const originalKey = process.env.GOOGLE_API_KEY;
			process.env.GOOGLE_API_KEY = "secret-key";

			try {
				const result = buildTerminalEnv(baseParams);
				expect(result.GOOGLE_API_KEY).toBeUndefined();
			} finally {
				// Restore original value
				if (originalKey === undefined) {
					delete process.env.GOOGLE_API_KEY;
				} else {
					process.env.GOOGLE_API_KEY = originalKey;
				}
			}
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
