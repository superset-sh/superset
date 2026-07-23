import { describe, expect, it } from "bun:test";
import { getHostId } from "@superset/shared/host-info";
import type { HostServiceContext } from "../../../types";
import { externalRouter } from "./external";

function createCaller(clientMachineId: string | undefined) {
	const ctx = {
		isAuthenticated: true,
		clientMachineId,
	} as unknown as HostServiceContext;
	return externalRouter.createCaller(ctx);
}

const LOCAL = getHostId();

describe("externalRouter locality guard", () => {
	it("rejects openInApp from a remote client (machine id mismatch)", async () => {
		const caller = createCaller("some-other-machine");
		await expect(
			caller.openInApp({ path: "/tmp/x", app: "zed" }),
		).rejects.toThrow(/local host machine/i);
	});

	it("rejects openInApp when no client machine id is present", async () => {
		const caller = createCaller(undefined);
		await expect(
			caller.openInApp({ path: "/tmp/x", app: "zed" }),
		).rejects.toThrow(/local host machine/i);
	});
});

describe("externalRouter input validation (local host)", () => {
	it("rejects a relative path", async () => {
		const caller = createCaller(LOCAL);
		await expect(
			caller.openInApp({ path: "relative/file.ts", app: "zed" }),
		).rejects.toThrow(/absolute path/i);
	});

	it("rejects a disallowed url scheme", async () => {
		const caller = createCaller(LOCAL);
		await expect(caller.openUrl("javascript:alert(1)")).rejects.toThrow(
			/scheme not allowed/i,
		);
	});
});
