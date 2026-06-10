import { spawnSync } from "node:child_process";
import {
	checkWindowsNativeBuildPrerequisites,
	formatWindowsNativeBuildPrereqError,
} from "./windows-native-build-prereqs";

if (process.env.SUPERSET_SKIP_DESKTOP_INSTALL_DEPS) {
	console.log(
		"[install:deps] Skipping desktop native dependency rebuild because SUPERSET_SKIP_DESKTOP_INSTALL_DEPS is set.",
	);
	process.exit(0);
}

const prereqCheck = checkWindowsNativeBuildPrerequisites();
if (!prereqCheck.ok) {
	console.error(
		formatWindowsNativeBuildPrereqError(prereqCheck, "install:deps"),
	);
	process.exit(1);
}

const result = spawnSync("bun", ["x", "electron-builder", "install-app-deps"], {
	encoding: "utf8",
	shell: false,
	env: process.env,
});

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

if (result.error) {
	console.error(
		`[install:deps] Failed to run electron-builder: ${result.error.message}`,
	);
	process.exit(1);
}

if (result.status === 0) {
	process.exit(0);
}

if (process.platform === "win32" && output.includes("MSB8040")) {
	console.error(
		[
			"",
			"[install:deps] Windows native rebuild failed because Visual Studio Spectre-mitigated libraries are missing.",
			"Install them from Visual Studio Installer > Build Tools 2022 > Individual components:",
			"- MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs",
			"- Windows 10 or Windows 11 SDK",
			"",
			"After installing, rerun `bun run --cwd apps/desktop install:deps`.",
			"Set SUPERSET_SKIP_DESKTOP_INSTALL_DEPS=1 only when you intentionally want `bun install` to skip Electron native rebuilds.",
		].join("\n"),
	);
}

process.exit(result.status ?? 1);
