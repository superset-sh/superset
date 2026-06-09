import {
	appendFileSync,
	existsSync,
	lstatSync,
	readdirSync,
	realpathSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import {
	packagedNodeModuleCopies,
	requiredMaterializedNodeModules,
} from "../runtime-dependencies";

type FileEntry = {
	path: string;
	size: number;
};

type PathSummary = {
	exists: boolean;
	files: FileEntry[];
	size: number;
	symlink: boolean;
};

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "../..");
const topLimit = Number(
	process.argv.find((arg) => arg.startsWith("--top="))?.split("=")[1] ?? "20",
);

function formatBytes(bytes: number): string {
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function collectFiles(targetPath: string, followSymlink = false): PathSummary {
	if (!existsSync(targetPath)) {
		return { exists: false, files: [], size: 0, symlink: false };
	}

	const stats = lstatSync(targetPath);
	if (stats.isSymbolicLink()) {
		if (followSymlink) {
			const targetSummary = collectFiles(realpathSync(targetPath));
			return { ...targetSummary, symlink: true };
		}

		return { exists: true, files: [], size: 0, symlink: true };
	}

	if (stats.isFile()) {
		return {
			exists: true,
			files: [{ path: targetPath, size: stats.size }],
			size: stats.size,
			symlink: false,
		};
	}

	if (!stats.isDirectory()) {
		return { exists: true, files: [], size: 0, symlink: false };
	}

	const files: FileEntry[] = [];
	const stack = [targetPath];

	while (stack.length > 0) {
		const currentPath = stack.pop();
		if (!currentPath) {
			continue;
		}

		for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
			const entryPath = join(currentPath, entry.name);

			if (entry.isSymbolicLink()) {
				continue;
			}

			if (entry.isDirectory()) {
				stack.push(entryPath);
				continue;
			}

			if (entry.isFile()) {
				files.push({ path: entryPath, size: lstatSync(entryPath).size });
			}
		}
	}

	const size = files.reduce((total, file) => total + file.size, 0);
	return { exists: true, files, size, symlink: false };
}

function relativeToRoot(path: string): string {
	return relative(rootDir, path);
}

function formatSummaryRow(label: string, targetPath: string): string {
	const summary = collectFiles(targetPath);
	const suffix = summary.symlink ? " (symlink, not followed)" : "";
	const value = summary.exists ? formatBytes(summary.size) : "missing";
	return `| ${label} | \`${relativeToRoot(targetPath)}\` | ${value}${suffix} |`;
}

function topFiles(files: FileEntry[], limit: number): FileEntry[] {
	return [...files]
		.sort((left, right) => right.size - left.size)
		.slice(0, limit);
}

function markdownListFiles(files: FileEntry[]): string {
	if (files.length === 0) {
		return "- None";
	}

	return files
		.map(
			(file) =>
				`- ${formatBytes(file.size)} - \`${relativeToRoot(file.path)}\``,
		)
		.join("\n");
}

function nativeModuleRows(): string[] {
	const copyRows = packagedNodeModuleCopies.map((copy) => {
		const targetPath = resolve(desktopDir, copy.from);
		const summary = collectFiles(targetPath, true);
		const filter = copy.filter.join(", ");
		const value = summary.exists ? formatBytes(summary.size) : "missing";
		const suffix = summary.symlink ? " (symlink target)" : "";
		return `| \`${copy.from}\` | ${value}${suffix} | \`${filter}\` |`;
	});

	const materializedOnly = requiredMaterializedNodeModules
		.filter(
			(moduleName) =>
				!packagedNodeModuleCopies.some((copy) =>
					copy.from.includes(moduleName),
				),
		)
		.map((moduleName) => {
			const targetPath = resolve(desktopDir, "node_modules", moduleName);
			const summary = collectFiles(targetPath, true);
			const value = summary.exists ? formatBytes(summary.size) : "missing";
			const suffix = summary.symlink ? " (symlink target)" : "";
			return `| \`node_modules/${moduleName}\` | ${value}${suffix} | materialized runtime module |`;
		});

	return [...copyRows, ...materializedOnly];
}

const distSummary = collectFiles(resolve(desktopDir, "dist"));
const sourcemaps = distSummary.files.filter((file) =>
	file.path.endsWith(".map"),
);
const sourcemapSize = sourcemaps.reduce((total, file) => total + file.size, 0);
const releaseSummary = collectFiles(resolve(desktopDir, "release"));
const releaseSourcemaps = releaseSummary.files.filter((file) =>
	file.path.endsWith(".map"),
);
const releaseSourcemapSize = releaseSourcemaps.reduce(
	(total, file) => total + file.size,
	0,
);
const releaseArtifacts = releaseSummary.files.filter((file) =>
	/\.(AppImage|dmg|zip|ya?ml)$/i.test(file.path),
);

const report = `# Desktop Package Size Report

Generated at: ${new Date().toISOString()}

## Directory Totals

| Area | Path | Size |
| --- | --- | ---: |
${[
	formatSummaryRow("dist", resolve(desktopDir, "dist")),
	formatSummaryRow("release", resolve(desktopDir, "release")),
	formatSummaryRow("resources", resolve(desktopDir, "src/resources")),
	formatSummaryRow(
		"bundled CLI",
		resolve(desktopDir, "dist/resources/bin/superset"),
	),
].join("\n")}

## Sourcemaps

- Count: ${sourcemaps.length}
- Total size: ${formatBytes(sourcemapSize)}
- Packaged release count: ${releaseSourcemaps.length}
- Packaged release total size: ${formatBytes(releaseSourcemapSize)}

## Largest dist Files

${markdownListFiles(topFiles(distSummary.files, topLimit))}

## Release Artifacts

${markdownListFiles(topFiles(releaseArtifacts, topLimit))}

## Native Runtime Copy Candidates

| Source | Current local size | Filter |
| --- | ---: | --- |
${nativeModuleRows().join("\n")}
`;

console.log(report);

if (process.env.GITHUB_STEP_SUMMARY) {
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${report}\n`);
}
