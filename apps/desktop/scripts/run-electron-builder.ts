import { spawnSync } from "node:child_process";
import {
	checkWindowsNativeBuildPrerequisites,
	formatWindowsNativeBuildPrereqError,
} from "./windows-native-build-prereqs";

const prereqCheck = checkWindowsNativeBuildPrerequisites();
if (!prereqCheck.ok) {
	console.error(
		formatWindowsNativeBuildPrereqError(prereqCheck, "desktop:build"),
	);
	process.exit(1);
}

const result = spawnSync(
	"bun",
	["x", "electron-builder", ...process.argv.slice(2)],
	{
		env: process.env,
		shell: false,
		stdio: "inherit",
	},
);

if (result.error) {
	console.error(
		`[desktop:build] Failed to run electron-builder: ${result.error.message}`,
	);
	process.exit(1);
}

process.exit(result.status ?? 1);
