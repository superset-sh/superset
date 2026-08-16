import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveAgentExecutable } from "./executable-resolver";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "superset-resolver-"));
	temporaryDirectories.push(directory);
	return directory;
}

async function writeExecutable(
	path: string,
	contents: string | Uint8Array = "#!/bin/sh\nexit 0\n",
) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, contents);
	await chmod(path, 0o755);
}

describe("resolveAgentExecutable", () => {
	test("resolves an explicit executable path containing spaces", async () => {
		const directory = await createTemporaryDirectory();
		const executable = join(directory, "agent tools", "my agent");
		await writeExecutable(executable);

		await expect(resolveAgentExecutable(executable, {})).resolves.toEqual({
			path: executable,
			source: "explicit",
		});
	});

	test("resolves commands from PATH", async () => {
		const directory = await createTemporaryDirectory();
		const executable = join(directory, "agent");
		await writeExecutable(executable);

		await expect(
			resolveAgentExecutable("agent", { PATH: directory }),
		).resolves.toEqual({ path: executable, source: "path" });
	});

	test("uses the first PATH executable, including a wrapper", async () => {
		const directory = await createTemporaryDirectory();
		const wrapperDirectory = join(directory, "wrapper");
		const nativeDirectory = join(directory, "native");
		const wrapper = join(wrapperDirectory, "agent");
		const native = join(nativeDirectory, "agent");
		await writeExecutable(
			wrapper,
			'#!/bin/sh\npackage="@example/agent"\ncommand="agent"\n',
		);
		await writeExecutable(native);

		await expect(
			resolveAgentExecutable(
				"agent",
				{ PATH: `${wrapperDirectory}:${nativeDirectory}` },
				{ pathDelimiter: ":", platform: "linux" },
			),
		).resolves.toEqual({ path: wrapper, source: "path" });
	});

	test("skips Superset's managed wrapper and resolves the real executable", async () => {
		const directory = await createTemporaryDirectory();
		const wrapperDirectory = join(directory, "superset");
		const nativeDirectory = join(directory, "native");
		const wrapper = join(wrapperDirectory, "agent");
		const native = join(nativeDirectory, "agent");
		await writeExecutable(
			wrapper,
			"#!/bin/sh\n# Superset agent-wrapper v3\nexit 127\n",
		);
		await writeExecutable(native);

		await expect(
			resolveAgentExecutable(
				"agent",
				{ PATH: `${wrapperDirectory}:${nativeDirectory}` },
				{ pathDelimiter: ":", platform: "linux" },
			),
		).resolves.toEqual({ path: native, source: "wrapper" });
	});

	test("treats an orphaned Superset wrapper as missing", async () => {
		const directory = await createTemporaryDirectory();
		const wrapper = join(directory, "agent");
		await writeExecutable(
			wrapper,
			"#!/bin/sh\n# Superset agent-wrapper v3\nexit 127\n",
		);

		await expect(
			resolveAgentExecutable(
				"agent",
				{ PATH: directory },
				{ pathDelimiter: ":", platform: "linux" },
			),
		).resolves.toBeNull();
	});

	test("ignores package dependency bins for implicit agent commands", async () => {
		const directory = await createTemporaryDirectory();
		const dependencyBin = join(directory, "node_modules", ".bin", "agent");
		await writeExecutable(dependencyBin);

		await expect(
			resolveAgentExecutable(
				"agent",
				{ PATH: dirname(dependencyBin) },
				{ pathDelimiter: ":", platform: "linux" },
			),
		).resolves.toBeNull();
		await expect(
			resolveAgentExecutable(dependencyBin, {}, { platform: "linux" }),
		).resolves.toEqual({ path: dependencyBin, source: "explicit" });
	});

	test("finds Windows cmd shims through PATHEXT", async () => {
		const directory = await createTemporaryDirectory();
		const executable = join(directory, "agent.CMD");
		await writeExecutable(executable);

		await expect(
			resolveAgentExecutable(
				"agent",
				{ PATH: directory, PATHEXT: ".CMD" },
				{ pathDelimiter: ";", platform: "win32" },
			),
		).resolves.toEqual({ path: executable, source: "path" });
	});

	test("uses the first Windows CMD shim", async () => {
		const directory = await createTemporaryDirectory();
		const wrapperDirectory = join(directory, "wrapper");
		const nativeDirectory = join(directory, "native");
		const wrapper = join(wrapperDirectory, "agent.CMD");
		const native = join(nativeDirectory, "agent.CMD");
		await writeExecutable(
			wrapper,
			'@echo off\npackage="@example/agent"\ncommand="agent"\n',
		);
		await writeExecutable(native);

		await expect(
			resolveAgentExecutable(
				"agent",
				{ PATH: `${wrapperDirectory};${nativeDirectory}`, PATHEXT: ".CMD" },
				{ pathDelimiter: ";", platform: "win32" },
			),
		).resolves.toEqual({ path: wrapper, source: "path" });
	});
});
