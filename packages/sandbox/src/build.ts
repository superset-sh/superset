/**
 * Turns `bundle/` into what a box installs at /opt/superset/bundle/<sha>/:
 *
 *   dist/bundle/<sha256>/
 *     setup, steps/, rootfs/          copied
 *     rootfs/etc/superset/contract.sh rendered from @superset/shared/sandbox-contract
 *     tools.tsv, assets.tsv, steps.tsv derived
 *   dist/bundle.tar.gz                the same tree, named by its sha in the bucket
 *
 *   bun run build.ts             build only; prints the bundle sha
 *   bun run build.ts --publish   also uploads the bundle and any asset the bucket lacks
 *   bun run build.ts --dry       prints what --publish would upload and which
 *                                step versions changed against dist/last-published.json
 *
 * The sha is a pure function of the tree, so a build on any machine names
 * the same bundle. Publishing refuses to write the bundle until every asset
 * it references exists in the bucket: a box must never be pointed at bytes
 * that are not there.
 */
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { renderContractShell } from "@superset/shared/sandbox-contract";
import { bucketFromEnv, contentTypeFor } from "./bucket";
import {
	type Assets,
	assetObjectKey,
	type DerivedStep,
	deriveStepVersions,
	loadAssets,
	loadSteps,
	renderAssetsTsv,
	renderStepsTsv,
	renderToolsTsv,
	sha256,
	walkRootfs,
} from "./manifest";
import { tarGzDirectory } from "./tarball";

export const PACKAGE_ROOT = join(import.meta.dir, "..");
export const BUNDLE_SRC = join(PACKAGE_ROOT, "bundle");
export const DIST = join(PACKAGE_ROOT, "dist");
const LAST_PUBLISHED = join(DIST, "last-published.json");
/** Where a produced asset's bytes are cached locally between builds. */
export const ASSET_CACHE = join(PACKAGE_ROOT, ".cache", "assets");

export interface BuiltBundle {
	sha256: string;
	dir: string;
	tarball: string;
	assets: Assets;
	steps: DerivedStep[];
}

export function buildBundle(): BuiltBundle {
	const staging = join(DIST, "staging");
	rmSync(staging, { recursive: true, force: true });
	mkdirSync(staging, { recursive: true });
	cpSync(join(BUNDLE_SRC, "setup"), join(staging, "setup"));
	cpSync(join(BUNDLE_SRC, "steps"), join(staging, "steps"), {
		recursive: true,
	});
	cpSync(join(BUNDLE_SRC, "rootfs"), join(staging, "rootfs"), {
		recursive: true,
	});
	mkdirSync(join(staging, "rootfs", "etc", "superset"), { recursive: true });
	writeFileSync(
		join(staging, "rootfs", "etc", "superset", "contract.sh"),
		renderContractShell(),
	);

	const assets = loadAssets(join(BUNDLE_SRC, "assets.json"));
	const tools = walkRootfs(join(staging, "rootfs"));
	const steps = deriveStepVersions({
		steps: loadSteps(join(BUNDLE_SRC, "steps.json")),
		assets,
		tools,
		stepsDir: join(staging, "steps"),
	});
	writeFileSync(join(staging, "tools.tsv"), renderToolsTsv(tools));
	writeFileSync(join(staging, "assets.tsv"), renderAssetsTsv(assets));
	writeFileSync(join(staging, "steps.tsv"), renderStepsTsv(steps));

	// A reproducible tarball, written here rather than by the system tar so the
	// sha is the tree's on every machine.
	const tarball = join(DIST, "bundle.tar.gz");
	const bytes = tarGzDirectory(staging);
	writeFileSync(tarball, bytes);
	const hash = sha256(bytes);
	const dir = join(DIST, "bundle", hash);
	rmSync(join(DIST, "bundle"), { recursive: true, force: true });
	mkdirSync(join(DIST, "bundle"), { recursive: true });
	cpSync(staging, dir, { recursive: true });
	rmSync(staging, { recursive: true, force: true });
	writeFileSync(join(DIST, "bundle.sha256"), `${hash}\n`);
	return { sha256: hash, dir, tarball, assets, steps };
}

function stepDiff(steps: DerivedStep[]): string[] {
	if (!existsSync(LAST_PUBLISHED)) return steps.map((s) => s.name);
	const last = JSON.parse(readFileSync(LAST_PUBLISHED, "utf8")) as {
		steps: Record<string, string>;
	};
	return steps
		.filter((s) => last.steps[s.name] !== s.version)
		.map((s) => s.name);
}

export async function publishBundle(
	built: BuiltBundle,
	options: { dry: boolean },
): Promise<void> {
	const bucket = bucketFromEnv();
	const missing: Array<{ key: string; name: string }> = [];
	for (const [name, asset] of Object.entries(built.assets)) {
		const key = assetObjectKey(asset);
		if (!(await bucket.exists(key))) missing.push({ key, name });
	}
	const bundleKey = `${built.sha256}.tar.gz`;
	const bundleMissing = !(await bucket.exists(bundleKey));
	const changed = stepDiff(built.steps);

	console.log(`bundle ${built.sha256}`);
	console.log(
		`steps re-run on the next wake: ${changed.length ? changed.join(", ") : "none"}`,
	);
	console.log(
		`assets to upload: ${missing.length ? missing.map((m) => m.name).join(", ") : "none"}`,
	);
	console.log(
		`bundle to upload: ${bundleMissing ? "yes" : "already published"}`,
	);
	if (options.dry) return;

	for (const { key, name } of missing) {
		const cached = join(ASSET_CACHE, key);
		if (!existsSync(cached)) {
			throw new Error(
				`asset ${name} (${key}) is not in the bucket and not in ${ASSET_CACHE}; run \`bun run assets ${name}\` to produce it`,
			);
		}
		const bytes = readFileSync(cached);
		if (sha256(bytes) !== built.assets[name]?.sha256) {
			throw new Error(`cached ${key} does not hash to its manifest row`);
		}
		await bucket.put(key, bytes, contentTypeFor(built.assets[name].suffix));
		console.log(`uploaded ${name} -> ${bucket.url(key)}`);
	}
	if (bundleMissing) {
		await bucket.put(
			bundleKey,
			readFileSync(built.tarball),
			"application/gzip",
		);
		console.log(`uploaded bundle -> ${bucket.url(bundleKey)}`);
	}
	writeFileSync(
		LAST_PUBLISHED,
		`${JSON.stringify(
			{
				sha256: built.sha256,
				steps: Object.fromEntries(built.steps.map((s) => [s.name, s.version])),
				publishedAt: new Date().toISOString(),
			},
			null,
			"\t",
		)}\n`,
	);
}

if (import.meta.main) {
	const built = buildBundle();
	const dry = process.argv.includes("--dry");
	const publish = process.argv.includes("--publish");
	if (dry || publish) await publishBundle(built, { dry });
	else console.log(built.sha256);
}
