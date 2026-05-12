import { describe, expect, test } from "bun:test";
import { buildAuthorizeUrl, detectHeadlessReason } from "./auth";

describe("detectHeadlessReason", () => {
	const base = {
		isTTY: true,
		platform: "darwin" as NodeJS.Platform,
		env: {} as NodeJS.ProcessEnv,
	};

	test("returns null for interactive macOS terminal", () => {
		expect(detectHeadlessReason(base)).toBeNull();
	});

	test("returns null for interactive Linux terminal with DISPLAY", () => {
		expect(
			detectHeadlessReason({
				...base,
				platform: "linux",
				env: { DISPLAY: ":0" },
			}),
		).toBeNull();
	});

	test("returns null for Linux with WAYLAND_DISPLAY", () => {
		expect(
			detectHeadlessReason({
				...base,
				platform: "linux",
				env: { WAYLAND_DISPLAY: "wayland-0" },
			}),
		).toBeNull();
	});

	test("blocks when stdout is not a TTY", () => {
		expect(detectHeadlessReason({ ...base, isTTY: false })).toBe("no TTY");
	});

	test("blocks in CI", () => {
		expect(detectHeadlessReason({ ...base, env: { CI: "true" } })).toBe(
			"CI environment",
		);
	});

	test("blocks when SSH_CONNECTION is set", () => {
		expect(
			detectHeadlessReason({
				...base,
				env: { SSH_CONNECTION: "10.0.0.1 12345 10.0.0.2 22" },
			}),
		).toBe("SSH session");
	});

	test("blocks when SSH_CLIENT is set (Daniel's EC2 case)", () => {
		expect(
			detectHeadlessReason({
				...base,
				env: { SSH_CLIENT: "10.0.0.1 12345 22" },
			}),
		).toBe("SSH session");
	});

	test("blocks when SSH_TTY is set", () => {
		expect(
			detectHeadlessReason({
				...base,
				env: { SSH_TTY: "/dev/pts/0" },
			}),
		).toBe("SSH session");
	});

	test("blocks on Linux with no DISPLAY and no WAYLAND_DISPLAY", () => {
		expect(detectHeadlessReason({ ...base, platform: "linux", env: {} })).toBe(
			"no display",
		);
	});

	test("blocks on FreeBSD with no DISPLAY", () => {
		expect(
			detectHeadlessReason({ ...base, platform: "freebsd", env: {} }),
		).toBe("no display");
	});

	test("does NOT block on macOS without DISPLAY (always has Aqua)", () => {
		expect(
			detectHeadlessReason({ ...base, platform: "darwin", env: {} }),
		).toBeNull();
	});

	test("does NOT block on Windows without DISPLAY", () => {
		expect(
			detectHeadlessReason({ ...base, platform: "win32", env: {} }),
		).toBeNull();
	});

	test("blocks in a Superset remote workspace", () => {
		expect(
			detectHeadlessReason({
				...base,
				env: { SUPERSET_REMOTE_WORKSPACE: "1" },
			}),
		).toBe("remote workspace");
	});

	test("blocks in a Docker container", () => {
		expect(
			detectHeadlessReason({ ...base, env: { CONTAINER: "docker" } }),
		).toBe("container");
	});

	test("blocks in a Kubernetes pod", () => {
		expect(
			detectHeadlessReason({
				...base,
				env: { KUBERNETES_SERVICE_HOST: "10.0.0.1" },
			}),
		).toBe("container");
	});
});

describe("buildAuthorizeUrl", () => {
	const fixture = {
		apiUrl: "https://api.superset.sh",
		redirectUri: "https://app.superset.sh/cli/auth/code",
		codeChallenge: "EXAMPLE_CHALLENGE",
		state: "EXAMPLE_STATE",
	};

	test("targets the better-auth oauth2 authorize endpoint", () => {
		const url = buildAuthorizeUrl(fixture);
		expect(url.origin).toBe("https://api.superset.sh");
		expect(url.pathname).toBe("/api/auth/oauth2/authorize");
	});

	test("always sets response_type=code (the value the server requires)", () => {
		const url = buildAuthorizeUrl(fixture);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.getAll("response_type")).toEqual(["code"]);
	});

	test("uses PKCE S256 challenge method", () => {
		const url = buildAuthorizeUrl(fixture);
		expect(url.searchParams.get("code_challenge")).toBe("EXAMPLE_CHALLENGE");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
	});

	test("preserves the chosen redirect_uri verbatim", () => {
		const loopback = buildAuthorizeUrl({
			...fixture,
			redirectUri: "http://127.0.0.1:51789/callback",
		});
		expect(loopback.searchParams.get("redirect_uri")).toBe(
			"http://127.0.0.1:51789/callback",
		);
	});

	test("requests openid + offline_access scopes", () => {
		const url = buildAuthorizeUrl(fixture);
		const scope = url.searchParams.get("scope") ?? "";
		expect(scope.split(" ").sort()).toEqual(
			["email", "offline_access", "openid", "profile"].sort(),
		);
	});

	test("ties the request to the API resource", () => {
		const url = buildAuthorizeUrl(fixture);
		expect(url.searchParams.get("resource")).toBe(fixture.apiUrl);
	});

	test("URL round-trip through string parses back to the same params", () => {
		const url = buildAuthorizeUrl(fixture);
		const parsed = new URL(url.toString());
		expect(parsed.searchParams.get("response_type")).toBe("code");
		expect(parsed.searchParams.get("client_id")).toBe("superset-cli");
		expect(parsed.searchParams.get("state")).toBe(fixture.state);
	});
});
