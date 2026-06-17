import { afterEach, describe, expect, test } from "bun:test";

import pkg from "./package.json" with { type: "json" };

// Reproduction for #5294: the released `cli-v0.2.22` darwin-arm64 binary
// reported `0.2.19`. The release pipeline (release-cli.yml) is triggered by a
// `cli-v<semver>` tag push and publishes a `version.txt` derived from that tag,
// but the binary's baked-in version comes solely from `packages/cli/package.json`
// (cli.config.ts → `SUPERSET_VERSION` define + framework `version`). When a tag
// is cut at a commit whose package.json wasn't bumped, the binary reports a
// stale version while the release advertises the tag version — so
// `superset update --check` is stuck on `upToDate: false`.
//
// The fix lets the release environment pin the build version via the
// `SUPERSET_VERSION` env var (set from the tag), making the tag the single
// source of truth at release time while still falling back to package.json
// for local/dev builds.

const ENV_KEY = "SUPERSET_VERSION";

async function loadConfigWithEnv(value: string | undefined) {
	const previous = process.env[ENV_KEY];
	if (value === undefined) {
		delete process.env[ENV_KEY];
	} else {
		process.env[ENV_KEY] = value;
	}
	try {
		// Cache-bust so the module re-evaluates against the current env.
		const mod = await import(`./cli.config.ts?v=${value ?? "unset"}`);
		return mod.default as { version: string; define?: Record<string, string> };
	} finally {
		if (previous === undefined) {
			delete process.env[ENV_KEY];
		} else {
			process.env[ENV_KEY] = previous;
		}
	}
}

describe("cli.config version resolution (#5294)", () => {
	afterEach(() => {
		delete process.env[ENV_KEY];
	});

	test("honors SUPERSET_VERSION from the release tag over package.json", async () => {
		const tagVersion = "0.2.22";
		// Guard: only meaningful if the env value differs from package.json,
		// mirroring the real incident (tag 0.2.22 vs package.json 0.2.19).
		const distinctTag = tagVersion === pkg.version ? "9.9.9" : tagVersion;

		const config = await loadConfigWithEnv(distinctTag);

		// Before the fix this is `pkg.version` (e.g. 0.2.19), reproducing the bug.
		expect(config.version).toBe(distinctTag);
		expect(config.define?.["process.env.SUPERSET_VERSION"]).toBe(
			JSON.stringify(distinctTag),
		);
	});

	test("falls back to package.json when SUPERSET_VERSION is unset", async () => {
		const config = await loadConfigWithEnv(undefined);
		expect(config.version).toBe(pkg.version);
	});
});
