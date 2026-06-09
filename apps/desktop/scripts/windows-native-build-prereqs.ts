import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

type DirentLike = {
	isDirectory(): boolean;
	name: string;
};

type FsLike = {
	existsSync(path: string): boolean;
	readdirSync(path: string, options: { withFileTypes: true }): DirentLike[];
};

type CheckOptions = {
	env?: NodeJS.ProcessEnv;
	fs?: FsLike;
	platform?: NodeJS.Platform;
};

export type WindowsNativeBuildPrereqCheck = {
	checked: boolean;
	missing: string[];
	msvcToolsetDirs: string[];
	ok: boolean;
	sdkDirs: string[];
	skipped: boolean;
};

const defaultFs: FsLike = {
	existsSync,
	readdirSync: (dir, options) =>
		readdirSync(dir, options) as unknown as DirentLike[],
};

function listDirectories(fs: FsLike, dir: string): string[] {
	if (!fs.existsSync(dir)) return [];

	try {
		return fs
			.readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(dir, entry.name));
	} catch {
		return [];
	}
}

function visualStudio2022Roots(env: NodeJS.ProcessEnv): string[] {
	return [env["ProgramFiles(x86)"], env.ProgramFiles]
		.filter((root): root is string => Boolean(root))
		.map((root) => path.join(root, "Microsoft Visual Studio", "2022"));
}

function findMsvcToolsetDirs(fs: FsLike, env: NodeJS.ProcessEnv): string[] {
	return visualStudio2022Roots(env).flatMap((vsRoot) =>
		listDirectories(fs, vsRoot).flatMap((editionDir) =>
			listDirectories(fs, path.join(editionDir, "VC", "Tools", "MSVC")),
		),
	);
}

function hasSpectreLibraries(fs: FsLike, toolsetDir: string): boolean {
	return ["x64", "x86"].every((arch) =>
		fs.existsSync(path.join(toolsetDir, "lib", "spectre", arch)),
	);
}

function hasMsvcCompilers(fs: FsLike, toolsetDir: string): boolean {
	return ["x64", "x86"].every((arch) =>
		fs.existsSync(path.join(toolsetDir, "bin", "Hostx64", arch, "cl.exe")),
	);
}

function windowsKitLibRoots(env: NodeJS.ProcessEnv): string[] {
	return [env["ProgramFiles(x86)"], env.ProgramFiles]
		.filter((root): root is string => Boolean(root))
		.flatMap((root) => [
			path.join(root, "Windows Kits", "10", "Lib"),
			path.join(root, "Windows Kits", "11", "Lib"),
		]);
}

function findWindowsSdkDirs(fs: FsLike, env: NodeJS.ProcessEnv): string[] {
	return windowsKitLibRoots(env).flatMap((sdkRoot) =>
		listDirectories(fs, sdkRoot),
	);
}

export function checkWindowsNativeBuildPrerequisites(
	options: CheckOptions = {},
): WindowsNativeBuildPrereqCheck {
	const platform = options.platform ?? process.platform;
	const env = options.env ?? process.env;
	const fs = options.fs ?? defaultFs;

	if (platform !== "win32") {
		return {
			checked: false,
			missing: [],
			msvcToolsetDirs: [],
			ok: true,
			sdkDirs: [],
			skipped: false,
		};
	}

	if (env.SUPERSET_SKIP_WINDOWS_NATIVE_BUILD_PREREQ_CHECK) {
		return {
			checked: false,
			missing: [],
			msvcToolsetDirs: [],
			ok: true,
			sdkDirs: [],
			skipped: true,
		};
	}

	const msvcToolsetDirs = findMsvcToolsetDirs(fs, env);
	const sdkDirs = findWindowsSdkDirs(fs, env);
	const missing: string[] = [];

	if (msvcToolsetDirs.length === 0) {
		missing.push("Visual Studio Build Tools 2022 C++ toolset");
	} else if (!msvcToolsetDirs.some((dir) => hasMsvcCompilers(fs, dir))) {
		missing.push("MSVC v143 C++ x64/x86 compiler tools");
	} else if (!msvcToolsetDirs.some((dir) => hasSpectreLibraries(fs, dir))) {
		missing.push("MSVC v143 C++ x64/x86 Spectre-mitigated libraries");
	}

	if (sdkDirs.length === 0) {
		missing.push("Windows 10 or Windows 11 SDK");
	}

	return {
		checked: true,
		missing,
		msvcToolsetDirs,
		ok: missing.length === 0,
		sdkDirs,
		skipped: false,
	};
}

export function formatWindowsNativeBuildPrereqError(
	check: WindowsNativeBuildPrereqCheck,
	context: string,
): string {
	return [
		`[${context}] Windows native build prerequisites are missing:`,
		...check.missing.map((item) => `- ${item}`),
		"",
		"Install them from Visual Studio Installer > Build Tools 2022 > Individual components:",
		"- MSVC v143 - VS 2022 C++ x64/x86 build tools",
		"- MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs",
		"- Windows 10 or Windows 11 SDK",
		"",
		"Then rerun the command.",
		"Set SUPERSET_SKIP_WINDOWS_NATIVE_BUILD_PREREQ_CHECK=1 only for CI images or custom toolchains that intentionally bypass this preflight.",
	].join("\n");
}
