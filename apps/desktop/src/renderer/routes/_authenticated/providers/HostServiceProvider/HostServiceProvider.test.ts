import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";
import { getSshHostServiceKey } from "./HostServiceProvider";

const HOST_SERVICE_PROVIDER_DIR = __dirname;

function readComponent(relativePath: string): string {
	return readFileSync(join(HOST_SERVICE_PROVIDER_DIR, relativePath), "utf-8");
}

describe("HostServiceProvider SSH tunnel wiring", () => {
	test("keys SSH tunnel services by host id only", () => {
		expect(getSshHostServiceKey("host-123")).toBe("host-123");
	});

	test("queries the dedicated sshTunnels router and hydrates host URLs", () => {
		const source = readComponent("HostServiceProvider.tsx");

		expect(source).toContain("t.sshTunnels.connect({");
		expect(source).toContain("hostId: host.id");
		expect(source).toContain("map.set(getSshHostServiceKey(host.id), status)");
		expect(source).toContain("status.hostUrl");
		expect(source).toContain("status.localPort");
	});
});
