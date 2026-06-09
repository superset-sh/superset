import { describe, expect, it } from "bun:test";
import path from "node:path";
import {
	checkWindowsNativeBuildPrerequisites,
	formatWindowsNativeBuildPrereqError,
} from "./windows-native-build-prereqs";

function normalizePath(value: string): string {
	return path.normalize(value).toLowerCase();
}

function fakeFs(paths: string[]) {
	const directories = new Set<string>();
	const existingPaths = new Set<string>();
	for (const candidate of paths) {
		let current = path.normalize(candidate);
		existingPaths.add(normalizePath(current));
		while (current && current !== path.dirname(current)) {
			directories.add(normalizePath(current));
			current = path.dirname(current);
		}
		directories.add(normalizePath(current));
	}

	return {
		existsSync(value: string) {
			const normalized = normalizePath(value);
			return directories.has(normalized) || existingPaths.has(normalized);
		},
		readdirSync(value: string, _options: { withFileTypes: true }) {
			const normalizedParent = normalizePath(value);
			const separator = path.sep;
			const prefix = normalizedParent.endsWith(separator)
				? normalizedParent
				: `${normalizedParent}${separator}`;
			const childNames = new Set<string>();

			for (const directory of directories) {
				if (!directory.startsWith(prefix)) continue;
				const rest = directory.slice(prefix.length);
				if (!rest || rest.includes(separator)) continue;
				childNames.add(rest);
			}

			return [...childNames].map((name) => ({
				isDirectory: () => true,
				name,
			}));
		},
	};
}

const env = {
	"ProgramFiles(x86)": "C:\\PF86",
	ProgramFiles: "C:\\PF",
} as NodeJS.ProcessEnv;
const programFilesX86 = "C:\\PF86";

const msvcVersionDir = path.join(
	programFilesX86,
	"Microsoft Visual Studio",
	"2022",
	"BuildTools",
	"VC",
	"Tools",
	"MSVC",
	"14.44.35207",
);
const sdkVersionDir = path.join(
	programFilesX86,
	"Windows Kits",
	"10",
	"Lib",
	"10.0.26100.0",
);

describe("checkWindowsNativeBuildPrerequisites", () => {
	it("does not check non-Windows platforms", () => {
		const result = checkWindowsNativeBuildPrerequisites({
			env,
			fs: fakeFs([]),
			platform: "linux",
		});

		expect(result.ok).toBe(true);
		expect(result.checked).toBe(false);
	});

	it("allows an explicit prerequisite-check skip for custom Windows builders", () => {
		const result = checkWindowsNativeBuildPrerequisites({
			env: {
				...env,
				SUPERSET_SKIP_WINDOWS_NATIVE_BUILD_PREREQ_CHECK: "1",
			},
			fs: fakeFs([]),
			platform: "win32",
		});

		expect(result.ok).toBe(true);
		expect(result.skipped).toBe(true);
	});

	it("reports missing Spectre libraries when the MSVC toolset exists", () => {
		const result = checkWindowsNativeBuildPrerequisites({
			env,
			fs: fakeFs([
				msvcVersionDir,
				path.join(msvcVersionDir, "bin", "Hostx64", "x64", "cl.exe"),
				path.join(msvcVersionDir, "bin", "Hostx64", "x86", "cl.exe"),
				sdkVersionDir,
			]),
			platform: "win32",
		});

		expect(result.ok).toBe(false);
		expect(result.missing).toContain(
			"MSVC v143 C++ x64/x86 Spectre-mitigated libraries",
		);
		expect(result.missing).not.toContain("Windows 10 or Windows 11 SDK");
	});

	it("reports missing compiler tools when the MSVC version directory is incomplete", () => {
		const result = checkWindowsNativeBuildPrerequisites({
			env,
			fs: fakeFs([msvcVersionDir, sdkVersionDir]),
			platform: "win32",
		});

		expect(result.ok).toBe(false);
		expect(result.missing).toContain("MSVC v143 C++ x64/x86 compiler tools");
		expect(result.missing).not.toContain(
			"MSVC v143 C++ x64/x86 Spectre-mitigated libraries",
		);
	});

	it("passes when MSVC Spectre libraries and a Windows SDK are present", () => {
		const result = checkWindowsNativeBuildPrerequisites({
			env,
			fs: fakeFs([
				msvcVersionDir,
				path.join(msvcVersionDir, "bin", "Hostx64", "x64", "cl.exe"),
				path.join(msvcVersionDir, "bin", "Hostx64", "x86", "cl.exe"),
				path.join(msvcVersionDir, "lib", "spectre", "x64"),
				path.join(msvcVersionDir, "lib", "spectre", "x86"),
				sdkVersionDir,
			]),
			platform: "win32",
		});

		expect(result.ok).toBe(true);
		expect(result.missing).toEqual([]);
	});

	it("formats actionable install guidance", () => {
		const result = checkWindowsNativeBuildPrerequisites({
			env,
			fs: fakeFs([]),
			platform: "win32",
		});

		expect(
			formatWindowsNativeBuildPrereqError(result, "desktop:build"),
		).toContain(
			"Visual Studio Installer > Build Tools 2022 > Individual components",
		);
	});
});
