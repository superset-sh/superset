import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const constantsModule = resolve(import.meta.dirname, "constants.ts");
const upstream =
	"https://github.com/superset-sh/superset/releases/latest/download";
const owned = "https://downloads.fixture.invalid/desktop/latest";

for (const [name, input, base] of [
	["default", undefined, upstream],
	["empty", "", upstream],
	["owned", owned, owned],
	["owned trailing slash", `${owned}/`, owned],
] as const) {
	test(`actual shared desktop download URLs ${name}`, () => {
		const directory = mkdtempSync(join(tmpdir(), "superset-download-origin-"));
		try {
			const probe = join(directory, "probe.ts");
			writeFileSync(
				probe,
				`const constants=await import(${JSON.stringify(constantsModule)});
console.log(JSON.stringify({links:[constants.DOWNLOAD_URL_MAC_ARM64,constants.DOWNLOAD_URL_MAC_X64,constants.DOWNLOAD_URL_LINUX_X64],repo:constants.COMPANY.GITHUB_URL,ios:constants.IOS_APP}));\n`,
			);
			const result = Bun.spawnSync([process.execPath, "--no-env-file", probe], {
				cwd: directory,
				env: { PATH: "/usr/bin:/bin", NEXT_PUBLIC_DOWNLOAD_URL: input },
				stdout: "pipe",
				stderr: "pipe",
				timeout: 5_000,
			});
			if (result.exitCode !== 0) process.stderr.write(result.stderr);
			expect(result.exitCode).toBe(0);
			expect(JSON.parse(result.stdout.toString())).toEqual({
				links: [
					"Superset-arm64.dmg",
					"Superset-x64.dmg",
					"Superset-x86_64.AppImage",
				].map((name) => `${base}/${name}`),
				repo: "https://github.com/superset-sh/superset",
				ios: {
					TEAM_ID: "NV9657CS5A",
					BUNDLE_ID: "sh.superset.mobile",
					APP_ID: "NV9657CS5A.sh.superset.mobile",
				},
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
}
