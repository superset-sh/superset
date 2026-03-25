import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";

const DEVICES_SETTINGS_DIR = __dirname;

function readComponent(relativePath: string): string {
	return readFileSync(join(DEVICES_SETTINGS_DIR, relativePath), "utf-8");
}

describe("DevicesSettings SSH diagnostics wiring", () => {
	test("renders host-keyed SSH status diagnostics and reconnect controls", () => {
		const source = readComponent("DevicesSettings.tsx");

		expect(source).toContain("sshStatuses.get(getSshHostServiceKey(host.id))");
		expect(source).toContain("getHostStatusTone(host.status)");
		expect(source).toContain("getHostStatusText(host.status)");
		expect(source).toContain("Reconnect");
		expect(source).toContain("Disconnect");
	});

	test("routes reconnect and disconnect actions through the sshTunnels API", () => {
		const source = readComponent("DevicesSettings.tsx");

		expect(source).toContain(
			"const disconnectHost = electronTrpc.sshTunnels.disconnect.useMutation",
		);
		expect(source).toContain("await disconnectHost.mutateAsync({");
		expect(source).toContain("await utils.sshTunnels.connect.fetch({");
		expect(source).toContain("await utils.sshTunnels.connect.invalidate({");
		expect(source).toContain('toast.success("SSH host reconnected")');
		expect(source).toContain('toast.success("SSH host disconnected")');
		expect(source).not.toContain("ensureConnection");
	});
});
