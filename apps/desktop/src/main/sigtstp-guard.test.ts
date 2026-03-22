import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";

describe("SIGTSTP guard", () => {
	test("process with SIGTSTP guard survives the signal on Linux", async () => {
		if (process.platform !== "linux") {
			// SIGTSTP suspension only affects Linux; skip elsewhere
			return;
		}

		// Spawn a child that installs the guard, then waits for SIGTSTP.
		// If the guard works, it stays alive and prints "alive" after receiving it.
		// If the guard is missing, the kernel stops the process and we see no output.
		const child = spawn(
			process.execPath, // bun
			[
				"-e",
				`
				process.on("SIGTSTP", () => {});
				// Signal readiness
				process.stdout.write("ready\\n");
				// Keep alive long enough for the signal to arrive
				setTimeout(() => {
					process.stdout.write("alive\\n");
					process.exit(0);
				}, 500);
				`,
			],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);

		const output = await new Promise<string>((resolve, reject) => {
			let buf = "";
			child.stdout.on("data", (chunk: Buffer) => {
				buf += chunk.toString();
				// Once we see "ready", send SIGTSTP
				if (buf.includes("ready") && !buf.includes("sent")) {
					buf += "sent";
					child.kill("SIGTSTP");
				}
			});
			child.on("close", () => resolve(buf));
			child.on("error", reject);
		});

		expect(output).toContain("alive");
	});

	test("process WITHOUT SIGTSTP guard is stopped by the signal on Linux", async () => {
		if (process.platform !== "linux") {
			return;
		}

		// Spawn a child WITHOUT the guard. SIGTSTP should stop it,
		// so "alive" is never printed before we kill it.
		const child = spawn(
			process.execPath,
			[
				"-e",
				`
				// NO SIGTSTP handler — default behavior = stop
				process.stdout.write("ready\\n");
				setTimeout(() => {
					process.stdout.write("alive\\n");
					process.exit(0);
				}, 500);
				`,
			],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);

		const output = await new Promise<string>((resolve) => {
			let buf = "";
			child.stdout.on("data", (chunk: Buffer) => {
				buf += chunk.toString();
				if (buf.includes("ready") && !buf.includes("sent")) {
					buf += "sent";
					child.kill("SIGTSTP");
					// Give the stopped process a moment, then terminate it
					setTimeout(() => {
						child.kill("SIGKILL");
					}, 800);
				}
			});
			child.on("close", () => resolve(buf));
		});

		// The process was stopped by SIGTSTP before it could print "alive"
		expect(output).not.toContain("alive");
	});
});
