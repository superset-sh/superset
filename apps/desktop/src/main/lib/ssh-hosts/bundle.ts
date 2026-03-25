import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import desktopPackageJson from "../../../../package.json";

interface BundleFileFromDisk {
	absolutePath: string;
	relativePath: string;
}

export interface SshHostBundleFile {
	contents: Buffer;
	relativePath: string;
}

export interface SshHostBundle {
	bundleHash: string;
	files: SshHostBundleFile[];
}

const REMOTE_RUNTIME_DEPENDENCIES = ["better-sqlite3", "node-pty"] as const;

function walkFiles(rootDir: string, relativeDir = ""): BundleFileFromDisk[] {
	const absoluteDir = path.join(rootDir, relativeDir);
	const entries = readdirSync(absoluteDir, { withFileTypes: true }).sort(
		(a, b) => a.name.localeCompare(b.name),
	);

	return entries.flatMap((entry) => {
		const entryRelativePath = path.join(relativeDir, entry.name);
		const entryAbsolutePath = path.join(rootDir, entryRelativePath);
		if (entry.isDirectory()) {
			return walkFiles(rootDir, entryRelativePath);
		}
		if (!entry.isFile()) {
			return [];
		}
		return [
			{
				absolutePath: entryAbsolutePath,
				relativePath: entryRelativePath,
			},
		];
	});
}

function resolveBundleRoot(): string {
	const candidateRoots = [
		path.join(process.resourcesPath, "resources", "remote-host-service"),
		path.resolve(__dirname, "../../../resources/remote-host-service"),
	];

	for (const candidate of candidateRoots) {
		const mainDir = path.join(candidate, "main");
		const migrationsDir = path.join(candidate, "host-migrations");
		if (existsSync(mainDir) && existsSync(migrationsDir)) {
			return candidate;
		}
	}

	throw new Error("Unable to locate SSH host-service bundle assets");
}

function buildRemotePackageManifest(): string {
	const dependencies = Object.fromEntries(
		REMOTE_RUNTIME_DEPENDENCIES.map((packageName) => {
			const version = desktopPackageJson.dependencies?.[packageName];
			if (!version) {
				throw new Error(
					`Missing runtime dependency version for ${packageName} in desktop package.json`,
				);
			}
			return [packageName, version];
		}),
	);

	return `${JSON.stringify(
		{
			name: "superset-remote-host-service",
			private: true,
			version: desktopPackageJson.version,
			dependencies,
			trustedDependencies: [...REMOTE_RUNTIME_DEPENDENCIES],
		},
		null,
		2,
	)}\n`;
}

export function getSshHostBundle(): SshHostBundle {
	const bundleRoot = resolveBundleRoot();
	const bundleFiles = ["main", "host-migrations"].flatMap((relativeDir) =>
		walkFiles(bundleRoot, relativeDir),
	);

	const manifestContents = buildRemotePackageManifest();
	const manifestStatSeed = createHash("sha256");
	const files: SshHostBundleFile[] = bundleFiles.map((file) => {
		const contents = readFileSync(file.absolutePath);
		const stats = statSync(file.absolutePath);
		manifestStatSeed.update(file.relativePath);
		manifestStatSeed.update(String(stats.size));
		manifestStatSeed.update(contents);
		return {
			contents,
			relativePath: file.relativePath.replaceAll(path.sep, "/"),
		};
	});
	manifestStatSeed.update("package.json");
	manifestStatSeed.update(manifestContents);

	files.push({
		contents: Buffer.from(manifestContents, "utf8"),
		relativePath: "package.json",
	});

	return {
		bundleHash: manifestStatSeed.digest("hex").slice(0, 16),
		files,
	};
}
