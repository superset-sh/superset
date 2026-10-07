import { afterEach, expect, mock, test } from "bun:test";
import { parseGitRemote } from "@superset/shared/git-remote";
import { detectRepoProvider } from "./detect-repo-provider";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
function remote(url = "https://git.internal:8443/Team/Sub/Repo.git") {
	const parsed = parseGitRemote(url);
	if (!parsed) throw new Error("Invalid fixture remote");
	return parsed;
}
function response(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

test("known hosts take precedence over stale provider hints without credential lookup", async () => {
	globalThis.fetch = mock(async () => {
		throw new Error("Unexpected probe");
	}) as unknown as typeof fetch;
	const getGitLabToken = async () => {
		throw new Error("Unexpected credential lookup");
	};
	expect(
		await detectRepoProvider(remote("https://github.com/team/repo"), {
			hint: { provider: "gitlab", url: "https://github.com/team/repo" },
			getGitLabToken,
		}),
	).toBe("github");
	expect(
		await detectRepoProvider(remote("git@gitlab.com:team/sub/repo.git"), {
			getGitLabToken,
		}),
	).toBe("gitlab");
});
test("trusted GitLab hint requires the live instance including HTTPS port", async () => {
	globalThis.fetch = mock(async () =>
		response({}, 401),
	) as unknown as typeof fetch;
	expect(
		await detectRepoProvider(remote(), {
			hint: { provider: "gitlab", url: "https://git.internal:8443/old/repo" },
		}),
	).toBe("gitlab");
	expect(
		await detectRepoProvider(remote(), {
			hint: { provider: "gitlab", url: "https://git.internal/old/repo" },
		}),
	).toBeNull();
	expect(
		await detectRepoProvider(remote(), {
			hint: { provider: "gitlab", url: "https://other.internal:8443/old/repo" },
		}),
	).toBeNull();
});
test("unknown hosts require GitLab version and revision metadata", async () => {
	globalThis.fetch = mock(async () =>
		response({ version: "18.1.2-ee", revision: "abcdef1234" }),
	) as unknown as typeof fetch;
	expect(await detectRepoProvider(remote())).toBe("gitlab");
	for (const data of [
		{},
		{ version: "passwordproxy" },
		{ version: "1.2.3" },
		{ version: "1.2.3", revision: "" },
	]) {
		globalThis.fetch = mock(async () =>
			response(data),
		) as unknown as typeof fetch;
		expect(await detectRepoProvider(remote())).toBeNull();
	}
});
test("bare 401 with failed scoped credentials never classifies a password proxy", async () => {
	globalThis.fetch = mock(async (_url, options) => {
		expect(options?.redirect).toBe("error");
		expect(options?.signal).toBeDefined();
		expect(options?.headers).toEqual({ Accept: "application/json" });
		return response({ message: "401 Unauthorized" }, 401);
	}) as unknown as typeof fetch;
	expect(
		await detectRepoProvider(remote(), {
			getGitLabToken: async () => {
				throw new Error("Scoped credentials unavailable");
			},
		}),
	).toBeNull();
});
test("network failure, redirects, and oversized metadata stay unknown", async () => {
	for (const answer of [
		async () => {
			throw new Error("unreachable");
		},
		async () => response({}, 302),
		async () => response({ version: "18.1.2", revision: "a".repeat(20000) }),
	]) {
		globalThis.fetch = mock(answer) as unknown as typeof fetch;
		expect(await detectRepoProvider(remote())).toBeNull();
	}
});
test("authenticated private custom instance needs a scoped token and valid metadata", async () => {
	globalThis.fetch = mock(async (_url, options) =>
		new Headers(options?.headers).has("Authorization")
			? response({ version: "18.1.2-ee", revision: "abcdef1234" })
			: response({}, 401),
	) as unknown as typeof fetch;
	const getGitLabToken = async (host: string) => {
		expect(host).toBe("git.internal:8443");
		return "HOST_SCOPED_FAKE_TOKEN";
	};
	expect(await detectRepoProvider(remote(), { getGitLabToken })).toBe("gitlab");
});
test("missing scoped token and unauthorized private proxy remain unknown", async () => {
	globalThis.fetch = mock(async () =>
		response({}, 401),
	) as unknown as typeof fetch;
	expect(
		await detectRepoProvider(remote(), { getGitLabToken: async () => null }),
	).toBeNull();
	expect(
		await detectRepoProvider(remote(), {
			getGitLabToken: async () => "HOST_SCOPED_FAKE_TOKEN",
		}),
	).toBeNull();
});

test("exceptional probes log host and error while normal denial remains quiet", async () => {
	const originalWarn = console.warn;
	const warnings: unknown[][] = [];
	try {
		console.warn = (...args) => {
			warnings.push(args);
		};
		const failure = new Error("fixture transport failure");
		globalThis.fetch = mock(async () => {
			throw failure;
		}) as unknown as typeof fetch;
		expect(await detectRepoProvider(remote())).toBeNull();
		expect(warnings).toEqual([
			[
				"[repo-provider] GitLab detection failed",
				{ host: "git.internal:8443", error: failure },
			],
		]);
		globalThis.fetch = mock(
			async () => new Response("", { status: 401 }),
		) as unknown as typeof fetch;
		expect(await detectRepoProvider(remote())).toBeNull();
		expect(warnings).toHaveLength(1);
	} finally {
		console.warn = originalWarn;
	}
});
