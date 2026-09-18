import { expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { quoteSingleShell } from "@superset/shared/agent-prompt-launch";
import type { HostDb } from "../../../../db";
import { generateWorkspaceNamesFromPrompt } from "./ai-workspace-names";

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

for (const mode of ["abort", "timeout"] as const) {
	test.skipIf(process.platform === "win32")(
		`CLI ${mode} stops the descendant process`,
		async () => {
			const root = mkdtempSync(join(tmpdir(), "naming-process-"));
			const shell = join(root, "shell");
			const pidFile = join(root, "pid");
			const previousShell = process.env.SHELL;
			const controller = new AbortController();
			const query = {
				from: () => query,
				where: () => query,
				orderBy: () => query,
				get: () => undefined,
			};
			const db = { select: () => query } as unknown as HostDb;
			let generation: Promise<unknown> | undefined;
			let pid: number | undefined;
			try {
				writeFileSync(
					shell,
					`#!/bin/sh\nsleep 90 &\nchild=$!\nprintf "%s" "$child" > ${quoteSingleShell(`${pidFile}.tmp`)}\nmv ${quoteSingleShell(`${pidFile}.tmp`)} ${quoteSingleShell(pidFile)}\nwait "$child"\n`,
					{ mode: 0o700 },
				);
				process.env.SHELL = shell;
				generation = generateWorkspaceNamesFromPrompt(
					"Fix login",
					{ db, agent: "claude" },
					undefined,
					controller.signal,
				);
				const deadline = Date.now() + 3000;
				while (!existsSync(pidFile) && Date.now() < deadline)
					await Bun.sleep(10);
				expect(existsSync(pidFile)).toBe(true);
				pid = Number(readFileSync(pidFile, "utf8"));
				expect(Number.isSafeInteger(pid) && pid > 1).toBe(true);
				expect(isAlive(pid)).toBe(true);
				if (mode === "abort") controller.abort();
				const result = await generation;
				if (mode === "abort") expect(result).toBeNull();
				else
					expect(result).toEqual({
						title: "Fix login",
						branchName: "fix-login",
					});
				const cleanupDeadline = Date.now() + 2000;
				while (isAlive(pid) && Date.now() < cleanupDeadline)
					await Bun.sleep(10);
				expect(isAlive(pid)).toBe(false);
			} finally {
				controller.abort();
				await generation;
				if (pid && isAlive(pid)) process.kill(pid, "SIGKILL");
				if (previousShell === undefined) delete process.env.SHELL;
				else process.env.SHELL = previousShell;
				rmSync(root, { recursive: true, force: true });
			}
		},
		30000,
	);
}
