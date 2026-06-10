import { afterEach, describe, expect, mock, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { buildOpenBrowserSpawn, refreshAccessToken } from "./auth";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("refreshAccessToken", () => {
	test("sanitizes OAuth refresh failure details", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({
						error: "invalid_grant",
						access_token: "access-secret",
						refresh_token: "refresh-secret",
						redirect: "https://app.superset.test/callback?code=code-secret",
						cookie: "session=session-secret",
					}),
					{ status: 400 },
				),
		) as unknown as typeof fetch;

		let thrown: unknown;
		try {
			await refreshAccessToken("refresh-secret");
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(CLIError);
		const error = thrown as CLIError;
		const visibleText = `${error.message} ${error.suggestion ?? ""}`;
		expect(visibleText).toContain("Token refresh failed: 400");
		expect(visibleText).toContain("superset auth login");
		expect(visibleText).not.toContain("access-secret");
		expect(visibleText).not.toContain("refresh-secret");
		expect(visibleText).not.toContain("session-secret");
		expect(visibleText).not.toContain("code-secret");
	});
});

describe("buildOpenBrowserSpawn", () => {
	test("uses cmd.exe with verbatim arguments on Windows", () => {
		const url =
			"https://app.superset.test/callback?code=abc&state=state%20123&resource=https%3A%2F%2Fapi.superset.test";
		const result = buildOpenBrowserSpawn(url, "win32", {
			COMSPEC: "C:\\Windows\\System32\\cmd.exe",
		});

		expect(result).toEqual({
			command: "C:\\Windows\\System32\\cmd.exe",
			args: ["/d", "/s", "/c", `start "" "${url}"`],
			windowsVerbatimArguments: true,
		});
	});

	test("uses direct argument arrays on macOS and Linux", () => {
		expect(buildOpenBrowserSpawn("https://superset.sh", "darwin")).toEqual({
			command: "open",
			args: ["https://superset.sh"],
		});
		expect(buildOpenBrowserSpawn("https://superset.sh", "linux")).toEqual({
			command: "xdg-open",
			args: ["https://superset.sh"],
		});
	});
});
