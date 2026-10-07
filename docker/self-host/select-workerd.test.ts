import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { Socket } from "node:net";
import { join } from "node:path";
import { selectWorkerd } from "./select-workerd.mjs";

const LOCKED = "1.20260730.1";
const RETAINED = "1.20260810.1";
const owned: string[] = [];
const deny = () => {
	throw new Error("Unexpected external or native operation");
};
beforeEach(() => {
	spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(deny, { preconnect: deny }),
	);
	spyOn(Socket.prototype, "connect").mockImplementation(deny);
});
afterEach(() => {
	for (const path of owned.splice(0))
		rmSync(path, { recursive: true, force: true });
	spyOn(Socket.prototype, "connect").mockRestore();
	spyOn(globalThis, "fetch").mockRestore();
});
function binary(arch = "arm64") {
	const bytes = Buffer.alloc(64);
	bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
	bytes.writeUInt16LE(arch === "arm64" ? 183 : 62, 18);
	bytes.write("owned fixture, never executed", 24);
	return bytes;
}
function fixture(arch = "arm64") {
	const root = realpathSync(mkdtempSync("/tmp/superset-workerd-selector-"));
	owned.push(root);
	const modules = join(root, "node_modules"),
		bundle = join(root, "bundle");
	mkdirSync(bundle);
	const wrangler = join(modules, "wrangler", "package.json"),
		workerd = join(modules, "workerd", "package.json");
	const leafName = `@cloudflare/workerd-linux-${arch === "arm64" ? "arm64" : "64"}`;
	const leaf = join(modules, leafName),
		leafMetadata = join(leaf, "package.json"),
		installedBinary = join(leaf, "bin", "workerd");
	for (const p of [
		join(modules, "wrangler"),
		join(modules, "workerd"),
		join(leaf, "bin"),
	])
		mkdirSync(p, { recursive: true });
	writeFileSync(
		wrangler,
		JSON.stringify({
			name: "wrangler",
			version: "4.118.0",
			dependencies: { workerd: LOCKED },
		}),
	);
	writeFileSync(
		workerd,
		JSON.stringify({
			name: "workerd",
			version: LOCKED,
			optionalDependencies: { [leafName]: LOCKED },
		}),
	);
	const metadata = (version = LOCKED) => ({
		name: leafName,
		version,
		os: ["linux"],
		cpu: [arch],
	});
	writeFileSync(leafMetadata, JSON.stringify(metadata()));
	writeFileSync(installedBinary, binary(arch), { mode: 0o755 });
	const outputPath = join(bundle, "workerd"),
		provenancePath = join(bundle, "workerd-runtime.json");
	const options = { wranglerPackage: wrangler, outputPath, provenancePath };
	const boundaries = { platform: "linux", arch, fetch: deny };
	return {
		root,
		bundle,
		leaf,
		leafMetadata,
		installedBinary,
		workerd,
		wrangler,
		leafName,
		metadata,
		options,
		boundaries,
		outputPath,
		provenancePath,
	};
}
function archive(
	f: ReturnType<typeof fixture>,
	change?: (directory: string) => void,
) {
	const root = join(f.root, "vendor"),
		pkg = join(root, "package"),
		file = join(f.root, "vendor.tgz");
	mkdirSync(join(pkg, "bin"), { recursive: true });
	writeFileSync(
		join(pkg, "package.json"),
		JSON.stringify(f.metadata(RETAINED)),
	);
	writeFileSync(join(pkg, "bin", "workerd"), binary(f.boundaries.arch));
	change?.(pkg);
	const packed = spawnSync(
		"/usr/bin/tar",
		["-czf", file, "-C", root, "package"],
		{
			env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
			encoding: "utf8",
			timeout: 5_000,
		},
	);
	if (packed.error) throw packed.error;
	expect(packed.status).toBe(0);
	const bytes = readFileSync(file),
		integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
	const url = `https://registry.npmjs.org/${f.leafName}/-/workerd-linux-${f.boundaries.arch === "arm64" ? "arm64" : "64"}-${RETAINED}.tgz`;
	const metadata = {
		...f.metadata(RETAINED),
		dist: { integrity, tarball: url },
	};
	const events: { url: string; options?: RequestInit }[] = [];
	const fetch = async (
		input: string | URL | Request,
		options?: RequestInit,
	) => {
		const requested = String(input instanceof Request ? input.url : input);
		events.push({ url: requested, options });
		if (requested === url) return new Response(bytes);
		expect(decodeURIComponent(new URL(requested).pathname)).toBe(
			`/${f.leafName}/${RETAINED}`,
		);
		return Response.json(metadata);
	};
	return {
		bytes,
		integrity,
		metadata,
		url,
		events,
		fetch,
		options: {
			...f.options,
			minimumVersion: RETAINED,
			overrideVersion: RETAINED,
			overrideSha512: integrity,
		},
	};
}
function noOutputs(f: ReturnType<typeof fixture>) {
	expect(existsSync(f.outputPath)).toBe(false);
	expect(existsSync(f.provenancePath)).toBe(false);
	expect(readdirSync(f.bundle)).toEqual([]);
}

for (const arch of ["arm64", "x64"])
	test(`genuine locked selector copies only matching ${arch} vendor bytes and records provenance`, async () => {
		const f = fixture(arch);
		await selectWorkerd(f.options, f.boundaries);
		expect(readFileSync(f.outputPath)).toEqual(binary(arch));
		expect(statSync(f.outputPath).mode & 0o777).toBe(0o755);
		const record = JSON.parse(readFileSync(f.provenancePath, "utf8"));
		expect(record.source).toBe("locked");
		expect(record.version).toBe(LOCKED);
		expect(record.package).toBe(f.leafName);
		expect(record.platform).toBe("linux");
		expect(record.arch).toBe(arch);
		expect(record.sha256).toBe(
			createHash("sha256").update(binary(arch)).digest("hex"),
		);
	});
test("retained floor refuses older locked runtime before any override request/output", async () => {
	const f = fixture();
	await expect(
		selectWorkerd({ ...f.options, minimumVersion: RETAINED }, f.boundaries),
	).rejects.toThrow("minimum");
	noOutputs(f);
});
for (const [name, mutate] of [
	[
		"wrong installed workerd version",
		(f: ReturnType<typeof fixture>) =>
			writeFileSync(
				f.workerd,
				JSON.stringify({ name: "workerd", version: RETAINED }),
			),
	],
	[
		"wrong leaf package",
		(f: ReturnType<typeof fixture>) =>
			writeFileSync(
				f.leafMetadata,
				JSON.stringify({ ...f.metadata(), name: "foreign" }),
			),
	],
	[
		"wrong leaf version",
		(f: ReturnType<typeof fixture>) =>
			writeFileSync(f.leafMetadata, JSON.stringify(f.metadata(RETAINED))),
	],
	[
		"wrong leaf architecture",
		(f: ReturnType<typeof fixture>) =>
			writeFileSync(
				f.leafMetadata,
				JSON.stringify({ ...f.metadata(), cpu: ["x64"] }),
			),
	],
	[
		"wrong ELF architecture",
		(f: ReturnType<typeof fixture>) =>
			writeFileSync(f.installedBinary, binary("x64")),
	],
	[
		"non-ELF executable",
		(f: ReturnType<typeof fixture>) =>
			writeFileSync(f.installedBinary, "#!/bin/sh\necho never-run\n"),
	],
] as const)
	test(`${name} refuses before output`, async () => {
		const f = fixture();
		mutate(f);
		await expect(selectWorkerd(f.options, f.boundaries)).rejects.toThrow();
		noOutputs(f);
	});
test("installed binary symlink outside vendor package refuses without modifying its target", async () => {
	const f = fixture(),
		target = join(f.root, "outside");
	writeFileSync(target, binary());
	rmSync(f.installedBinary);
	symlinkSync(target, f.installedBinary);
	await expect(selectWorkerd(f.options, f.boundaries)).rejects.toThrow();
	expect(readFileSync(target)).toEqual(binary());
	noOutputs(f);
});
for (const extra of [
	{ overrideVersion: RETAINED },
	{ overrideSha512: `sha512-${Buffer.alloc(64).toString("base64")}` },
	{ overrideVersion: "latest", overrideSha512: "sha512-invalid" },
])
	test(`incomplete or floating override refuses ${JSON.stringify(extra)}`, async () => {
		const f = fixture();
		await expect(
			selectWorkerd({ ...f.options, ...extra }, f.boundaries),
		).rejects.toThrow();
		noOutputs(f);
	});
test("verified exact-version override preserves retained floor and records the pinned archive integrity", async () => {
	const f = fixture(),
		a = archive(f);
	await selectWorkerd(a.options, { ...f.boundaries, fetch: a.fetch });
	expect(readFileSync(f.outputPath)).toEqual(binary());
	const record = JSON.parse(readFileSync(f.provenancePath, "utf8"));
	expect(record.source).toBe("override");
	expect(record.version).toBe(RETAINED);
	expect(record.integrity).toBe(a.integrity);
	expect(a.events).toHaveLength(2);
	for (const request of a.events) {
		expect(request.options?.redirect).toBe("manual");
		expect(request.options?.credentials).toBe("omit");
		expect(request.options?.signal).toBeInstanceOf(AbortSignal);
	}
});
test("altered archive bytes refuse before extraction and never fall back to the locked binary", async () => {
	const f = fixture(),
		a = archive(f);
	const fetch = async (input: string | URL | Request, options?: RequestInit) =>
		String(input) === a.url
			? new Response(Buffer.concat([a.bytes, Buffer.from("altered")]))
			: a.fetch(input, options);
	await expect(
		selectWorkerd(a.options, { ...f.boundaries, fetch }),
	).rejects.toThrow("integrity");
	noOutputs(f);
});
for (const [name, mutate] of [
	[
		"metadata version",
		(m: ReturnType<typeof archive>["metadata"]) => {
			m.version = LOCKED;
		},
	],
	[
		"metadata digest",
		(m: ReturnType<typeof archive>["metadata"]) => {
			m.dist.integrity = `sha512-${Buffer.alloc(64).toString("base64")}`;
		},
	],
	[
		"private artifact host",
		(m: ReturnType<typeof archive>["metadata"]) => {
			m.dist.tarball = "https://10.0.0.3/vendor.tgz";
		},
	],
	[
		"credentialed artifact URL",
		(m: ReturnType<typeof archive>["metadata"]) => {
			m.dist.tarball = "https://user:secret@registry.npmjs.org/vendor.tgz";
		},
	],
] as const)
	test(`${name} refuses before requesting artifact`, async () => {
		const f = fixture(),
			a = archive(f);
		mutate(a.metadata);
		await expect(
			selectWorkerd(a.options, { ...f.boundaries, fetch: a.fetch }),
		).rejects.toThrow();
		expect(a.events).toHaveLength(1);
		noOutputs(f);
	});
test("redirected exact-version metadata refuses without following location", async () => {
	const f = fixture(),
		a = archive(f);
	let requested = 0;
	await expect(
		selectWorkerd(a.options, {
			...f.boundaries,
			fetch: async () => {
				requested++;
				return new Response(null, {
					status: 302,
					headers: { location: "https://untrusted.invalid/" },
				});
			},
		}),
	).rejects.toThrow();
	expect(requested).toBe(1);
	noOutputs(f);
});
test("archive metadata contradicting authenticated platform/version refuses", async () => {
	const f = fixture(),
		a = archive(f, (pkg) =>
			writeFileSync(
				join(pkg, "package.json"),
				JSON.stringify(f.metadata(LOCKED)),
			),
		);
	await expect(
		selectWorkerd(a.options, { ...f.boundaries, fetch: a.fetch }),
	).rejects.toThrow();
	noOutputs(f);
});
test("required archive symlink refuses without creating arbitrary extracted paths", async () => {
	const f = fixture(),
		a = archive(f, (pkg) => {
			rmSync(join(pkg, "bin", "workerd"));
			symlinkSync("../../../outside", join(pkg, "bin", "workerd"));
		});
	await expect(
		selectWorkerd(a.options, { ...f.boundaries, fetch: a.fetch }),
	).rejects.toThrow();
	noOutputs(f);
	expect(existsSync(join(f.bundle, "outside"))).toBe(false);
});
test("duplicate required archive member refuses", async () => {
	const f = fixture(),
		a = archive(f),
		raw = join(f.root, "duplicate.tar"),
		vendor = join(f.root, "vendor");
	const first = spawnSync(
		"/usr/bin/tar",
		["-cf", raw, "-C", vendor, "package"],
		{ encoding: "utf8", timeout: 5_000 },
	);
	expect(first.status).toBe(0);
	const second = spawnSync(
		"/usr/bin/tar",
		["-rf", raw, "-C", vendor, "package/bin/workerd"],
		{ encoding: "utf8", timeout: 5_000 },
	);
	expect(second.status).toBe(0);
	const compressed = spawnSync("/usr/bin/gzip", ["-c", raw], {
		timeout: 5_000,
	});
	expect(compressed.status).toBe(0);
	a.metadata.dist.integrity = `sha512-${createHash("sha512").update(compressed.stdout).digest("base64")}`;
	await expect(
		selectWorkerd(
			{ ...a.options, overrideSha512: a.metadata.dist.integrity },
			{
				...f.boundaries,
				fetch: async (input: string | URL | Request) =>
					String(input) === a.url
						? new Response(compressed.stdout)
						: Response.json(a.metadata),
			},
		),
	).rejects.toThrow();
	noOutputs(f);
});
test("existing or identical output paths refuse and preserve caller bytes", async () => {
	const f = fixture();
	writeFileSync(f.outputPath, "caller bytes");
	await expect(selectWorkerd(f.options, f.boundaries)).rejects.toThrow();
	expect(readFileSync(f.outputPath, "utf8")).toBe("caller bytes");
	expect(existsSync(f.provenancePath)).toBe(false);
	rmSync(f.outputPath);
	await expect(
		selectWorkerd({ ...f.options, provenancePath: f.outputPath }, f.boundaries),
	).rejects.toThrow();
	noOutputs(f);
});
test("output symlink refuses without changing the linked destination", async () => {
	const f = fixture(),
		sentinel = join(f.root, "sentinel");
	writeFileSync(sentinel, "preserve");
	symlinkSync(sentinel, f.outputPath);
	await expect(selectWorkerd(f.options, f.boundaries)).rejects.toThrow();
	expect(readFileSync(sentinel, "utf8")).toBe("preserve");
	expect(existsSync(f.provenancePath)).toBe(false);
});

test("verified x64 override selects the genuine x64 archive rather than an arm64 binary", async () => {
	const f = fixture("x64"),
		a = archive(f);
	await selectWorkerd(a.options, { ...f.boundaries, fetch: a.fetch });
	expect(readFileSync(f.outputPath)).toEqual(binary("x64"));
	expect(JSON.parse(readFileSync(f.provenancePath, "utf8")).package).toBe(
		f.leafName,
	);
	expect(readdirSync(f.bundle).sort()).toEqual([
		"workerd",
		"workerd-runtime.json",
	]);
});
test("failed registry transport cleans owned temporary files and refuses fallback", async () => {
	const f = fixture(),
		a = archive(f);
	await expect(
		selectWorkerd(a.options, {
			...f.boundaries,
			fetch: async () => {
				throw Error("owned transport failure");
			},
		}),
	).rejects.toThrow();
	noOutputs(f);
});
test("oversized metadata refuses before the artifact request and removes owned temporary files", async () => {
	const f = fixture(),
		a = archive(f);
	let requests = 0;
	await expect(
		selectWorkerd(a.options, {
			...f.boundaries,
			fetch: async () => {
				requests++;
				return new Response(" ".repeat(65 * 1024));
			},
		}),
	).rejects.toThrow("size limit");
	expect(requests).toBe(1);
	noOutputs(f);
});
test("verified but malformed archive refuses and removes tar and runtime temporary files", async () => {
	const f = fixture(),
		a = archive(f),
		bytes = Buffer.from("owned invalid gzip");
	a.metadata.dist.integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
	await expect(
		selectWorkerd(
			{ ...a.options, overrideSha512: a.metadata.dist.integrity },
			{
				...f.boundaries,
				fetch: async (input: string | URL | Request) =>
					String(input) === a.url
						? new Response(bytes)
						: Response.json(a.metadata),
			},
		),
	).rejects.toThrow();
	noOutputs(f);
});
test("override cannot downgrade the locked version even when the minimum is lower", async () => {
	const f = fixture();
	await expect(
		selectWorkerd(
			{
				...f.options,
				minimumVersion: "1.20260101.1",
				overrideVersion: "1.20260102.1",
				overrideSha512: `sha512-${Buffer.alloc(64).toString("base64")}`,
			},
			f.boundaries,
		),
	).rejects.toThrow("downgrade");
	noOutputs(f);
});
test("unsupported platform refuses before selecting bytes or touching external transport", async () => {
	const f = fixture();
	await expect(
		selectWorkerd(f.options, { ...f.boundaries, platform: "darwin" }),
	).rejects.toThrow("platform");
	noOutputs(f);
});
test("unrelated official-registry path refuses before downloading even correctly pinned vendor bytes", async () => {
	const f = fixture(),
		a = archive(f);
	a.metadata.dist.tarball = `https://registry.npmjs.org/unrelated/-/unrelated-${RETAINED}.tgz`;
	let requests = 0;
	await expect(
		selectWorkerd(a.options, {
			...f.boundaries,
			fetch: async () => {
				requests++;
				return requests === 1
					? Response.json(a.metadata)
					: new Response(a.bytes);
			},
		}),
	).rejects.toThrow();
	expect(requests).toBe(1);
	noOutputs(f);
});
test("pending registry transport receives the real timeout signal and cleans owned files on abort", async () => {
	const f = fixture(),
		a = archive(f),
		original = AbortSignal.timeout.bind(AbortSignal);
	const timer = spyOn(AbortSignal, "timeout").mockImplementation(
		(milliseconds) => {
			expect(milliseconds).toBe(15_000);
			return original(10);
		},
	);
	try {
		await expect(
			selectWorkerd(a.options, {
				...f.boundaries,
				fetch: async (_input: string | URL | Request, options?: RequestInit) =>
					new Promise((_resolve, reject) => {
						options?.signal?.addEventListener(
							"abort",
							() => reject(Error("owned timeout")),
							{ once: true },
						);
					}),
			}),
		).rejects.toThrow("timeout");
		noOutputs(f);
	} finally {
		timer.mockRestore();
	}
});
