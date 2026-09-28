import { afterAll, describe, expect, test } from "bun:test";
import { terminateHost } from "./terminate";

const spawned: Bun.Subprocess[] = [];

afterAll(() => {
	for (const child of spawned) child.kill("SIGKILL");
});

async function startFakeHost({ ignoreSigterm = false } = {}) {
	const script = `${ignoreSigterm ? "process.on('SIGTERM', () => {});" : ""} setInterval(() => {}, 1000); console.log('ready');`;
	const child = Bun.spawn([process.execPath, "-e", script], {
		stdout: "pipe",
		stderr: "ignore",
	});
	spawned.push(child);
	await child.stdout.getReader().read();
	return child;
}

describe("terminateHost", () => {
	test("SIGTERMs a child host and waits for it to exit", async () => {
		const host = await startFakeHost();

		await terminateHost(host.pid, { exited: host.exited, timeoutMs: 5_000 });

		expect(host.signalCode).toBe("SIGTERM");
	});

	test("escalates to SIGKILL when the host ignores SIGTERM", async () => {
		const host = await startFakeHost({ ignoreSigterm: true });

		await terminateHost(host.pid, { exited: host.exited, timeoutMs: 200 });

		expect(host.signalCode).toBe("SIGKILL");
	});

	test("polls a host that is not our child until it exits", async () => {
		const host = await startFakeHost({ ignoreSigterm: true });

		await terminateHost(host.pid, { timeoutMs: 200 });
		await host.exited;

		expect(host.signalCode).toBe("SIGKILL");
	});

	test("gives up on a process that never exits", async () => {
		const parent = Bun.spawn(
			[
				"perl",
				"-e",
				'$|=1; my $pid = fork(); exit 0 if $pid == 0; print "$pid\\n"; sleep 30',
			],
			{ stdout: "pipe", stderr: "ignore" },
		);
		spawned.push(parent);
		const { value } = await parent.stdout.getReader().read();
		const zombiePid = Number(new TextDecoder().decode(value).trim());

		const startedAt = Date.now();
		await terminateHost(zombiePid, { timeoutMs: 200 });

		expect(Date.now() - startedAt).toBeLessThan(2_000);
	});

	test("does not signal a process group for a negative pid", async () => {
		const groupLeader = Bun.spawn(
			["perl", "-e", '$|=1; setpgrp(0, 0); print "ready\\n"; sleep 30'],
			{ stdout: "pipe", stderr: "ignore" },
		);
		spawned.push(groupLeader);
		await groupLeader.stdout.getReader().read();

		await terminateHost(-groupLeader.pid);

		expect(groupLeader.exitCode).toBeNull();
		expect(groupLeader.signalCode).toBeNull();
	});
});
