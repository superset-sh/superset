import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runProcess } from "./client-packaging";

test("process capture waits for trailing output after the child exits", async () => {
	const root = mkdtempSync("/tmp/superset-process-close-");
	try {
		writeFileSync(
			join(root, "git"),
			`#!${process.execPath}\nconst {spawn}=require("node:child_process");spawn(process.execPath,["-e",'process.stdout.write(JSON.stringify({data:"x".repeat(262144),version:"TRAILER"}))'],{stdio:["ignore",1,"ignore"]}).unref();process.exit(0);`,
			{ mode: 0o700 },
		);
		const output = await runProcess({
			command: "git",
			args: [],
			cwd: root,
			env: { PATH: root },
		});
		expect(JSON.parse(output)).toEqual({
			data: "x".repeat(262144),
			version: "TRAILER",
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
