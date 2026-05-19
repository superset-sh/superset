import { afterAll, afterEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "superset-cli-logout-"));
process.env.SUPERSET_HOME_DIR = tempHome;

const { readConfig, writeConfig } = await import("../../../lib/config");
const { writeManifest } = await import("../../../lib/host/manifest");
const { default: logoutCommand } = await import("./command");

function noSuchProcessError(): NodeJS.ErrnoException {
	const error = new Error("No such process") as NodeJS.ErrnoException;
	error.code = "ESRCH";
	return error;
}

function writeLoggedInConfig(): void {
	writeConfig({
		organizationId: "org_1",
		apiKey: "sk_live_existing",
		auth: {
			accessToken: "access-token",
			refreshToken: "refresh-token",
			expiresAt: Date.now() + 60_000,
		},
	});
}

function writeHostManifest(pid: number): void {
	writeManifest({
		pid,
		endpoint: "http://127.0.0.1:49152",
		authToken: "host-token",
		startedAt: Date.now(),
		organizationId: "org_1",
	});
}

async function runLogout(): Promise<void> {
	await logoutCommand.run({
		options: {},
		args: {},
		ctx: {},
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	fs.rmSync(path.join(tempHome, "config.json"), { force: true });
	fs.rmSync(path.join(tempHome, "config.json.tmp"), { force: true });
	fs.rmSync(path.join(tempHome, "host"), { recursive: true, force: true });
});

afterAll(() => {
	fs.rmSync(tempHome, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
});

describe("auth logout", () => {
	it("sends SIGTERM to the running host before clearing credentials", async () => {
		const pid = 91_001;
		writeLoggedInConfig();
		writeHostManifest(pid);
		const order: string[] = [];
		let sigtermSent = false;
		let checksAfterSigterm = 0;
		const killSpy = spyOn(process, "kill").mockImplementation(((
			targetPid: number,
			signal?: NodeJS.Signals | number,
		) => {
			expect(targetPid).toBe(pid);
			if (signal === 0) {
				order.push(sigtermSent ? "alive-after-sigterm" : "alive-before");
				if (!sigtermSent) return true;
				checksAfterSigterm += 1;
				if (checksAfterSigterm < 2) return true;
				throw noSuchProcessError();
			}

			expect(signal).toBe("SIGTERM");
			order.push("sigterm");
			expect(readConfig().auth?.refreshToken).toBe("refresh-token");
			sigtermSent = true;
			return true;
		}) as typeof process.kill);

		try {
			await runLogout();
		} finally {
			killSpy.mockRestore();
		}

		expect(order).toEqual([
			"alive-before",
			"sigterm",
			"alive-after-sigterm",
			"alive-after-sigterm",
		]);
		expect(readConfig()).toEqual({ organizationId: "org_1" });
	});

	it("waits up to five seconds for host death, then clears credentials", async () => {
		const pid = 91_002;
		writeLoggedInConfig();
		writeHostManifest(pid);
		let now = 1_700_000_000_000;
		const nowSpy = spyOn(Date, "now").mockImplementation(() => now);
		const timeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(((
			handler: Parameters<typeof setTimeout>[0],
			timeout?: Parameters<typeof setTimeout>[1],
			...args: unknown[]
		) => {
			if (typeof timeout === "number") now += timeout;
			if (typeof handler === "function") {
				const callback = handler as (...callbackArgs: unknown[]) => void;
				callback(...args);
			}
			return 0 as unknown as ReturnType<typeof setTimeout>;
		}) as typeof setTimeout);
		const killSpy = spyOn(process, "kill").mockImplementation(((
			targetPid: number,
			signal?: NodeJS.Signals | number,
		) => {
			expect(targetPid).toBe(pid);
			expect(signal === 0 || signal === "SIGTERM").toBe(true);
			return true;
		}) as typeof process.kill);

		try {
			await runLogout();
			expect(timeoutSpy).toHaveBeenCalledTimes(50);
		} finally {
			killSpy.mockRestore();
			timeoutSpy.mockRestore();
			nowSpy.mockRestore();
		}

		expect(readConfig()).toEqual({ organizationId: "org_1" });
	});
});
