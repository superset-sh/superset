/**
 * The bundle's manifests. `assets.json` and `steps.json` are written by
 * hand; everything derived from them (`tools.tsv`, `assets.tsv`, `steps.tsv`
 * and each step's version) is computed here at build and never edited.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative } from "node:path";
import { z } from "zod";

export const SHA256 = /^[0-9a-f]{64}$/;

const assetSchema = z.object({
	/** sha256 of the object's bytes; the object's name in the bucket. */
	sha256: z.string().regex(SHA256),
	/**
	 * Appended to the sha in the bucket key so a browser or curl sees a type.
	 * Empty for an executable, which has none.
	 */
	suffix: z.string().regex(/^(\.[a-z0-9.]+)?$/),
	/** Absolute path on the box. Archives are staged under the media dir. */
	dest: z.string().startsWith("/"),
	mode: z
		.string()
		.regex(/^0[0-7]{3}$/)
		.default("0644"),
	/** Provenance only: where build.ts fetched it. The box never uses it. */
	source: z.string().url().optional(),
	/** A human-readable version for rows that move on purpose (host-service, Chrome). */
	version: z.string().optional(),
	/** For executables: the Node major they were built against. */
	node: z.number().int().optional(),
});
export type Asset = z.infer<typeof assetSchema>;
export const assetsSchema = z.record(
	z.string().regex(/^[a-z0-9-]+$/),
	assetSchema,
);
export type Assets = z.infer<typeof assetsSchema>;

const stepSchema = z.object({
	name: z.string().regex(/^[a-z0-9-]+$/),
	/** Asset keys the step consumes; their shas are part of its version. */
	assets: z.array(z.string()).default([]),
	/** Steps whose versions are part of this one's: re-run when they re-run. */
	after: z.array(z.string()).default([]),
	/** Files under rootfs the step reads; their hashes are part of its version. */
	inputs: z.array(z.string().startsWith("/")).default([]),
	/** Bump to force a re-run with no other change. */
	salt: z.string().default(""),
});
export type Step = z.infer<typeof stepSchema>;
export const stepsSchema = z.array(stepSchema);

export function sha256(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(path: string): string {
	return sha256(readFileSync(path));
}

/** `rootfs/` walked into rows: mode, sha256, source (relative), destination (absolute). */
export interface ToolRow {
	mode: string;
	sha256: string;
	source: string;
	dest: string;
}

export function walkRootfs(rootfsDir: string): ToolRow[] {
	const rows: ToolRow[] = [];
	const visit = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				visit(full);
				continue;
			}
			const rel = relative(rootfsDir, full).split("\\").join("/");
			const stat = statSync(full);
			const executable = (stat.mode & 0o111) !== 0;
			rows.push({
				mode: executable ? "0755" : "0644",
				sha256: sha256File(full),
				source: posix.join("rootfs", rel),
				dest: `/${rel}`,
			});
		}
	};
	visit(rootfsDir);
	return rows;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

export function renderToolsTsv(rows: ToolRow[]): string {
	return rows
		.map((r) => [r.mode, r.sha256, b64(r.source), b64(r.dest)].join("\t"))
		.join("\n")
		.concat(rows.length ? "\n" : "");
}

export function renderAssetsTsv(assets: Assets): string {
	return Object.values(assets)
		.map((a) => [a.mode, a.sha256, a.suffix, b64(a.dest)].join("\t"))
		.join("\n")
		.concat(Object.keys(assets).length ? "\n" : "");
}

export interface DerivedStep extends Step {
	version: string;
}

/**
 * A step's version is the hash of everything that can change what it does:
 * its script, the assets it consumes, the rootfs files it reads, the versions
 * of the steps it follows, and its salt. Steps are returned in manifest order,
 * which is execution order; `after` must point at earlier steps.
 */
export function deriveStepVersions(args: {
	steps: Step[];
	assets: Assets;
	tools: ToolRow[];
	stepsDir: string;
}): DerivedStep[] {
	const toolsByDest = new Map(args.tools.map((t) => [t.dest, t.sha256]));
	const versions = new Map<string, string>();
	const derived: DerivedStep[] = [];
	for (const step of args.steps) {
		const parts: string[] = [];
		parts.push(`script:${sha256File(join(args.stepsDir, `${step.name}.sh`))}`);
		for (const key of step.assets) {
			const asset = args.assets[key];
			if (!asset)
				throw new Error(`step ${step.name} declares unknown asset ${key}`);
			parts.push(`asset:${key}:${asset.sha256}`);
		}
		for (const input of step.inputs) {
			const hash = toolsByDest.get(input);
			if (!hash)
				throw new Error(
					`step ${step.name} declares input ${input}, which rootfs does not carry`,
				);
			parts.push(`input:${input}:${hash}`);
		}
		for (const dep of step.after) {
			const version = versions.get(dep);
			if (!version)
				throw new Error(
					`step ${step.name} runs after ${dep}, which is not an earlier step`,
				);
			parts.push(`after:${dep}:${version}`);
		}
		if (step.salt) parts.push(`salt:${step.salt}`);
		const version = sha256(parts.join("\n"));
		versions.set(step.name, version);
		derived.push({ ...step, version });
	}
	return derived;
}

export function renderStepsTsv(steps: DerivedStep[]): string {
	return steps
		.map((s) => [s.name, s.version, s.assets.join(",")].join("\t"))
		.join("\n")
		.concat(steps.length ? "\n" : "");
}

export function loadAssets(path: string): Assets {
	return assetsSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function loadSteps(path: string): Step[] {
	return stepsSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function assetObjectKey(
	asset: Pick<Asset, "sha256" | "suffix">,
): string {
	return `${asset.sha256}${asset.suffix}`;
}
