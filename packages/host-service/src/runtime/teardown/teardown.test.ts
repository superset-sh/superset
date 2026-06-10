import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildTeardownInitialCommand,
	resolveTeardownScriptPath,
} from "./teardown";

function isFishAvailable(): boolean {
	const result = spawnSync("fish", ["-c", "exit 0"], { stdio: "ignore" });
	return result.status === 0;
}

describe("teardown initial command", () => {
	test("uses exec instead of shell-specific exit status syntax", () => {
		const command = buildTeardownInitialCommand(
			"/tmp/worktree/.superset/teardown.sh",
		);

		expect(command).toBe("exec bash '/tmp/worktree/.superset/teardown.sh'");
		expect(command).not.toContain("$?");
	});

	test("builds a cmd-compatible Bun teardown command", () => {
		const command = buildTeardownInitialCommand(
			"C:\\worktree\\.superset\\teardown.ts",
			"cmd.exe",
		);

		expect(command).toBe(
			'bun "C:\\worktree\\.superset\\teardown.ts" && exit /b 0 || exit /b 1',
		);
	});

	test("builds a PowerShell-compatible Bun teardown command", () => {
		const command = buildTeardownInitialCommand(
			"C:\\work tree\\.superset\\teardown.ts",
			"powershell.exe",
		);

		expect(command).toBe(
			"bun 'C:\\work tree\\.superset\\teardown.ts'; exit $LASTEXITCODE",
		);
	});

	test("builds cmd-compatible Windows native teardown commands", () => {
		expect(
			buildTeardownInitialCommand(
				"C:\\work tree\\.superset\\teardown.cmd",
				"cmd.exe",
				"win32",
			),
		).toBe(
			'"C:\\work tree\\.superset\\teardown.cmd" && exit /b 0 || exit /b 1',
		);

		expect(
			buildTeardownInitialCommand(
				"C:\\work tree\\.superset\\teardown.ps1",
				"cmd.exe",
				"win32",
			),
		).toBe(
			'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\\work tree\\.superset\\teardown.ps1" && exit /b 0 || exit /b 1',
		);
	});

	test("builds PowerShell-compatible Windows native teardown commands", () => {
		expect(
			buildTeardownInitialCommand(
				"C:\\work tree\\.superset\\teardown.cmd",
				"powershell.exe",
				"win32",
			),
		).toBe(
			"cmd.exe /d /s /c '\"C:\\work tree\\.superset\\teardown.cmd\"'; exit $LASTEXITCODE",
		);

		expect(
			buildTeardownInitialCommand(
				"C:\\work tree\\.superset\\teardown.ps1",
				"powershell.exe",
				"win32",
			),
		).toBe(
			"powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\\work tree\\.superset\\teardown.ps1'; exit $LASTEXITCODE",
		);
	});

	test("prefers portable teardown.ts on Windows", () => {
		const root = mkdtempSync(join(tmpdir(), "host-service-teardown-"));
		try {
			const dir = join(root, ".superset");
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, "teardown.sh"), "#!/usr/bin/env bash\n", "utf-8");
			writeFileSync(join(dir, "teardown.ts"), "console.log('bye');\n", "utf-8");

			expect(resolveTeardownScriptPath(root, "win32")).toBe(
				join(dir, "teardown.ts"),
			);
			expect(resolveTeardownScriptPath(root, "linux")).toBe(
				join(dir, "teardown.sh"),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("discovers Windows-native teardown scripts on Windows", () => {
		const root = mkdtempSync(join(tmpdir(), "host-service-teardown-"));
		try {
			const dir = join(root, ".superset");
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, "teardown.ps1"), "Write-Output bye\n", "utf-8");
			writeFileSync(
				join(dir, "teardown.cmd"),
				"@echo off\r\necho bye\r\n",
				"utf-8",
			);

			expect(resolveTeardownScriptPath(root, "win32")).toBe(
				join(dir, "teardown.cmd"),
			);
			expect(resolveTeardownScriptPath(root, "linux")).toBeNull();

			writeFileSync(join(dir, "teardown.ts"), "console.log('bye');\n", "utf-8");

			expect(resolveTeardownScriptPath(root, "win32")).toBe(
				join(dir, "teardown.ts"),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("exits fish with the teardown script status", () => {
		if (!isFishAvailable()) return;

		const root = mkdtempSync(join(tmpdir(), "host-service-teardown-"));
		const dirWithQuote = join(root, "quote's dir");
		const scriptPath = join(dirWithQuote, "teardown.sh");

		try {
			mkdirSync(dirWithQuote, { recursive: true });
			writeFileSync(scriptPath, "#!/usr/bin/env bash\nexit 7\n", {
				mode: 0o755,
			});
			chmodSync(scriptPath, 0o755);

			const result = spawnSync("fish", [
				"-c",
				buildTeardownInitialCommand(scriptPath),
			]);

			expect(result.status).toBe(7);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
