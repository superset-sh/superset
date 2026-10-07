import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const [name, base, version, expected] of [
	[
		"upstream rolling",
		"",
		"latest",
		"https://github.com/superset-sh/superset/releases/download/cli-latest",
	],
	[
		"upstream pinned",
		"",
		"cli-v1.35.1",
		"https://github.com/superset-sh/superset/releases/download/cli-v1.35.1",
	],
	[
		"owned rolling",
		"https://downloads.fixture.invalid/cli/",
		"latest",
		"https://downloads.fixture.invalid/cli/cli-latest",
	],
	[
		"owned pinned",
		"https://downloads.fixture.invalid/cli",
		"cli-v1.35.1",
		"https://downloads.fixture.invalid/cli/cli-v1.35.1",
	],
]) {
	const supportedPlatform =
		process.platform === "darwin" || process.platform === "linux";
	(supportedPlatform ? test : test.skip)(
		`actual installer download origin ${name}`,
		() => {
			const directory = mkdtempSync(join(tmpdir(), "superset-cli-installer-"));
			try {
				const bin = join(directory, "tools");
				mkdirSync(bin);
				const curl = join(bin, "curl");
				writeFileSync(
					curl,
					'#!/bin/sh\nfor arg in "$@"; do url="$arg"; done\nprintf "%s\\n" "$url" > "$SUPERSET_INSTALL_URL_LOG"\nexit 1\n',
				);
				chmodSync(curl, 0o755);
				const urlLog = join(directory, "requested-url");
				const result = Bun.spawnSync(
					["/bin/sh", join(import.meta.dirname, "install.sh")],
					{
						cwd: directory,
						env: {
							PATH: `${bin}:/usr/bin:/bin`,
							TMPDIR: directory,
							SUPERSET_HOME: join(directory, "install"),
							SUPERSET_VERSION: version,
							SUPERSET_CLI_BASE_URL: base,
							SUPERSET_INSTALL_URL_LOG: urlLog,
						},
						stdout: "pipe",
						stderr: "pipe",
						timeout: 10_000,
					},
				);
				expect(result.exitCode).toBe(1);
				expect(readFileSync(urlLog, "utf8").trim()).toBe(
					`${expected}/superset-${process.platform}-${process.arch}.tar.gz`,
				);
				expect(readdirSync(directory).sort()).toEqual([
					"requested-url",
					"tools",
				]);
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		},
		15_000,
	);
}
