import { describe, expect, test } from "bun:test";
import { getHostServiceQueryMethodOverride } from "./hostTransport";

describe("getHostServiceQueryMethodOverride", () => {
	test.each([
		"http://127.0.0.1:41001",
		"http://localhost:41001",
		"http://[::1]:41001",
	])("uses POST for the bundled loopback host service at %s", (hostUrl) => {
		expect(getHostServiceQueryMethodOverride(hostUrl)).toBe("POST");
	});

	test.each([
		"https://relay.superset.sh/hosts/org:host",
		"https://relay2.superset.sh/hosts/org:host",
		"https://workspace.preview.bl.run",
	])("keeps remote query transport backwards-compatible at %s", (hostUrl) => {
		expect(getHostServiceQueryMethodOverride(hostUrl)).toBeUndefined();
	});

	test("fails closed for an invalid URL", () => {
		expect(getHostServiceQueryMethodOverride("not a URL")).toBeUndefined();
	});
});
