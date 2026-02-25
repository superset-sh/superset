import {
	accessSync,
	chmodSync,
	constants,
	copyFileSync,
	existsSync,
	mkdirSync,
	realpathSync,
	rmSync,
	statSync,
} from "node:fs";
import { dirname, join } from "node:path";

const projectRoot = join(import.meta.dirname, "..");
const outputRoot = join(
	projectRoot,
	"dist",
	"resources",
	"bin",
	"gh",
	`${process.platform}-${process.arch}`,
);
const binaryName = process.platform === "win32" ? "gh.exe" : "gh";
const outputPath = join(outputRoot, binaryName);

function fail(message: string): never {
	console.error(`[bundle:gh-cli] ${message}`);
	process.exit(1);
}

function isExecutableFile(path: string): boolean {
	try {
		if (!statSync(path).isFile()) {
			return false;
		}

		if (process.platform === "win32") {
			return true;
		}

		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function findExecutableInPath(name: string): string | null {
	const pathValue = process.env.PATH ?? "";
	const dirs = pathValue.split(process.platform === "win32" ? ";" : ":");
	const pathExt = process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM";
	const extensions =
		process.platform === "win32"
			? pathExt
					.split(";")
					.filter(Boolean)
					.map((ext) => ext.toLowerCase())
			: [""];

	for (const dir of dirs) {
		if (!dir) continue;

		if (process.platform === "win32") {
			const hasKnownExt = extensions.some((ext) =>
				name.toLowerCase().endsWith(ext),
			);
			if (hasKnownExt) {
				const candidate = join(dir, name);
				if (isExecutableFile(candidate)) {
					return candidate;
				}
				continue;
			}

			for (const ext of extensions) {
				const candidate = join(dir, `${name}${ext}`);
				if (isExecutableFile(candidate)) {
					return candidate;
				}
			}

			continue;
		}

		const candidate = join(dir, name);
		if (isExecutableFile(candidate)) {
			return candidate;
		}
	}

	return null;
}

function resolveGhSourcePath(): string {
	const overridePath = process.env.SUPERSET_GH_BIN_PATH;
	if (overridePath) {
		if (!existsSync(overridePath)) {
			fail(
				`SUPERSET_GH_BIN_PATH is set but missing: ${overridePath}. ` +
					"Point it to a valid gh executable.",
			);
		}
		if (!isExecutableFile(overridePath)) {
			fail(`SUPERSET_GH_BIN_PATH is not an executable file: ${overridePath}.`);
		}
		return realpathSync(overridePath);
	}

	const discoveredPath = findExecutableInPath("gh");
	if (!discoveredPath) {
		fail(
			[
				"Unable to find `gh` in PATH.",
				"Install GitHub CLI on the build machine or set SUPERSET_GH_BIN_PATH.",
			].join(" "),
		);
	}
	return realpathSync(discoveredPath);
}

function main(): void {
	const sourcePath = resolveGhSourcePath();
	const targetDir = dirname(outputPath);

	rmSync(outputRoot, { recursive: true, force: true });
	mkdirSync(targetDir, { recursive: true });
	copyFileSync(sourcePath, outputPath);

	if (process.platform !== "win32") {
		chmodSync(outputPath, 0o755);
	}

	console.log(`[bundle:gh-cli] source: ${sourcePath}`);
	console.log(`[bundle:gh-cli] bundled: ${outputPath}`);
}

main();
