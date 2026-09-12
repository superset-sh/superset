import { describe, expect, test } from "bun:test";
import {
	deriveHostVersionState,
	hostNeedsUpdate,
	isHostUpdateTarget,
	parseHostInstallSource,
} from "./host-version";

describe("deriveHostVersionState", () => {
	test("same version is current", () => {
		expect(deriveHostVersionState("1.27.0", "1.27.0")).toBe("current");
	});

	test("older than the client but above the floor is behind", () => {
		expect(deriveHostVersionState("1.22.0", "1.27.0", "1.21.0")).toBe("behind");
	});

	test("below the floor is incompatible even when the client is older too", () => {
		expect(deriveHostVersionState("1.19.3", "1.27.0", "1.21.0")).toBe(
			"incompatible",
		);
		expect(deriveHostVersionState("1.19.3", "1.19.3", "1.21.0")).toBe(
			"incompatible",
		);
	});

	test("exactly the floor is not incompatible", () => {
		expect(deriveHostVersionState("1.21.0", "1.27.0", "1.21.0")).toBe("behind");
	});

	test("newer than the client is ahead", () => {
		expect(deriveHostVersionState("1.28.0", "1.27.0")).toBe("ahead");
	});

	test("canary suffixes still compare on the base version", () => {
		expect(deriveHostVersionState("1.27.0", "1.27.0-canary.20260907")).toBe(
			"current",
		);
	});

	test("missing or unparseable versions are unknown, never behind", () => {
		expect(deriveHostVersionState(null, "1.27.0")).toBe("unknown");
		expect(deriveHostVersionState("", "1.27.0")).toBe("unknown");
		expect(deriveHostVersionState("garbage", "1.27.0")).toBe("unknown");
		expect(deriveHostVersionState("1.27.0", null)).toBe("unknown");
	});

	test("a host below the floor is incompatible even with an unknown client", () => {
		expect(deriveHostVersionState("1.0.0", undefined, "1.21.0")).toBe(
			"incompatible",
		);
	});
});

describe("hostNeedsUpdate", () => {
	test("only behind and incompatible want an update", () => {
		expect(hostNeedsUpdate("behind")).toBe(true);
		expect(hostNeedsUpdate("incompatible")).toBe(true);
		expect(hostNeedsUpdate("current")).toBe(false);
		expect(hostNeedsUpdate("ahead")).toBe(false);
		expect(hostNeedsUpdate("unknown")).toBe(false);
	});
});

describe("parseHostInstallSource", () => {
	test("accepts the known sources and falls back to unknown", () => {
		expect(parseHostInstallSource("desktop")).toBe("desktop");
		expect(parseHostInstallSource("cli")).toBe("cli");
		expect(parseHostInstallSource("dev")).toBe("dev");
		expect(parseHostInstallSource(undefined)).toBe("unknown");
		expect(parseHostInstallSource("systemd")).toBe("unknown");
	});
});

test("development versions do not block workspaces", () => {
	expect(deriveHostVersionState("0.0.0-dev", "1.27.0")).toBe("unknown");
});

test("only released app versions can target a standalone update", () => {
	expect(isHostUpdateTarget("1.27.0")).toBe(true);
	for (const version of ["1.27.0-canary.1", "0.0.0-dev", "v1.27.0", "01.27.0"])
		expect(isHostUpdateTarget(version)).toBe(false);
});
