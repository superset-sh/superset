import { describe, expect, it } from "bun:test";
import { getHostVersionState, hostInfoQueryKey } from "./useHostInfo";

describe("getHostVersionState", () => {
	it("matches equal release and prerelease versions", () => {
		expect(getHostVersionState("1.14.0", "1.14.0")).toBe("match");
		expect(getHostVersionState("1.14.0-2", "1.14.0-2")).toBe("match");
	});

	it("treats an earlier prerelease as outdated", () => {
		expect(getHostVersionState("1.14.0-1", "1.14.0-2")).toBe("outdated");
	});

	it("treats numeric interim releases as newer than their stable baseline", () => {
		expect(getHostVersionState("1.14.0", "1.14.0-2")).toBe("outdated");
		expect(getHostVersionState("1.14.0-2", "1.14.0")).toBe("newer");
	});

	it("detects newer versions without offering downgrade semantics", () => {
		expect(getHostVersionState("1.15.0", "1.14.0")).toBe("newer");
	});

	it("rejects invalid running or expected versions", () => {
		expect(getHostVersionState("dev", "1.14.0")).toBe("invalid");
		expect(getHostVersionState("01.14.0", "1.14.0")).toBe("invalid");
		expect(getHostVersionState("1.14.0", "latest")).toBe("invalid");
	});
});

describe("hostInfoQueryKey", () => {
	it("retains the existing remote host info cache key", () => {
		expect(hostInfoQueryKey("org-1", "machine-1")).toEqual([
			"remoteHostInfo",
			"org-1",
			"machine-1",
		]);
	});
});
