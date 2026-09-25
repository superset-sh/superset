import { beforeEach, describe, expect, spyOn, test } from "bun:test";

type ExecWithShellEnv =
	typeof import("../workspaces/utils/shell-env").execWithShellEnv;

describe("checkGithubStarred / starGithubRepo", () => {
	let checkGithubStarred: typeof import("./index").checkGithubStarred;
	let starGithubRepo: typeof import("./index").starGithubRepo;
	let execMock: ReturnType<
		typeof spyOn<
			typeof import("../workspaces/utils/shell-env"),
			"execWithShellEnv"
		>
	>;

	beforeEach(async () => {
		const shellEnvModule = await import("../workspaces/utils/shell-env");
		execMock = spyOn(shellEnvModule, "execWithShellEnv");

		const mod = await import("./index");
		checkGithubStarred = mod.checkGithubStarred;
		starGithubRepo = mod.starGithubRepo;
	});

	test("returns 'starred' when gh api responds 204", async () => {
		execMock.mockImplementation((async () => ({
			stdout: "HTTP/2.0 204 No Content\n\n",
			stderr: "",
		})) as unknown as ExecWithShellEnv);

		expect(await checkGithubStarred()).toBe("starred");
		expect(execMock).toHaveBeenCalledWith(
			"gh",
			["api", "--include", "user/starred/superset-sh/superset"],
			{ timeout: 10_000 },
		);
	});

	test("returns 'starred' when gh api responds 200", async () => {
		execMock.mockImplementation((async () => ({
			stdout: "HTTP/2.0 200 OK\n\n",
			stderr: "",
		})) as unknown as ExecWithShellEnv);

		expect(await checkGithubStarred()).toBe("starred");
	});

	test("returns 'not_starred' on a definitive 404", async () => {
		execMock.mockImplementation((async () => {
			throw new Error(
				"Command failed: gh api user/starred/superset-sh/superset\ngh: Not Found (HTTP 404)",
			);
		}) as unknown as ExecWithShellEnv);

		expect(await checkGithubStarred()).toBe("not_starred");
	});

	test("returns 'unknown' when gh is not installed", async () => {
		execMock.mockImplementation((async () => {
			const error = new Error("spawn gh ENOENT") as NodeJS.ErrnoException;
			error.code = "ENOENT";
			throw error;
		}) as unknown as ExecWithShellEnv);

		expect(await checkGithubStarred()).toBe("unknown");
	});

	test("returns 'unknown' on an unrecognized response", async () => {
		execMock.mockImplementation((async () => ({
			stdout: "HTTP/2.0 403 Forbidden\n\n",
			stderr: "",
		})) as unknown as ExecWithShellEnv);

		expect(await checkGithubStarred()).toBe("unknown");
	});

	test("star: returns true on a clean exit", async () => {
		execMock.mockImplementation((async () => ({
			stdout: "",
			stderr: "",
		})) as unknown as ExecWithShellEnv);

		expect(await starGithubRepo()).toBe(true);
		expect(execMock).toHaveBeenCalledWith(
			"gh",
			["api", "-X", "PUT", "user/starred/superset-sh/superset"],
			{ timeout: 10_000 },
		);
	});

	test("star: returns false on any failure", async () => {
		execMock.mockImplementation((async () => {
			throw new Error(
				"Command failed: gh api -X PUT user/starred/superset-sh/superset",
			);
		}) as unknown as ExecWithShellEnv);

		expect(await starGithubRepo()).toBe(false);
	});
});
