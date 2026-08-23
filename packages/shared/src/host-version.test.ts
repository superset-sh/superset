import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import semver from "semver";
import { MIN_HOST_SERVICE_VERSION } from "./host-version";

const hostServiceVersion: string = JSON.parse(
	readFileSync(
		new URL("../../host-service/package.json", import.meta.url),
		"utf-8",
	),
).version;

describe("MIN_HOST_SERVICE_VERSION", () => {
	it("is a valid semver version", () => {
		expect(semver.valid(MIN_HOST_SERVICE_VERSION)).not.toBeNull();
	});

	// Host-service left its own 0.x line for the unified product version
	// (desktop == host-service == cli at every release), and the floor was
	// never migrated with it, so `>=0.8.0` accepted every 1.x host and the
	// gate could not reject anything (#6525). Keeping the floor on the same
	// major line as the shipped host-service makes that drift loud.
	it("lives on the same major line as the shipped host-service", () => {
		expect(semver.major(MIN_HOST_SERVICE_VERSION)).toBe(
			semver.major(hostServiceVersion),
		);
	});

	it("never exceeds the version we ship", () => {
		expect(semver.gte(hostServiceVersion, MIN_HOST_SERVICE_VERSION)).toBe(true);
	});

	// The incident behind #6525: `terminal.list` shipped in 1.22.0 and every
	// client calls it unconditionally, so a 1.20.2 host renders a blank
	// terminal pane. The gate must reject that host.
	it("rejects a host from before terminal.list existed", () => {
		expect(semver.satisfies("1.20.2", `>=${MIN_HOST_SERVICE_VERSION}`)).toBe(
			false,
		);
	});

	// Rejecting 1.20.2 alone would still pass with a floor of 1.21.0, which
	// admits hosts without terminal.list. Pin the introduction version.
	it("is not below the terminal.list introduction version", () => {
		expect(semver.gte(MIN_HOST_SERVICE_VERSION, "1.22.0")).toBe(true);
	});
});
