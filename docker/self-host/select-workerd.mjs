import { spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import {
	chmodSync,
	closeSync,
	createReadStream,
	linkSync,
	lstatSync,
	mkdtempSync,
	openSync,
	readFileSync,
	readSync,
	realpathSync,
	rmSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";

class RuntimeError extends Error {}
const refuse = (message) => {
	throw new RuntimeError(message);
};
const ARCHIVE_LIMIT = 128 * 1024 * 1024;
const BINARY_LIMIT = 256 * 1024 * 1024;
const TAR_LIMIT = 512 * 1024 * 1024;
const MEMBERS = ["package/package.json", "package/bin/workerd"];

function versionParts(value) {
	if (!/^\d{1,3}\.\d{8}\.\d{1,6}$/.test(value ?? ""))
		refuse("An exact workerd version is required");
	const parts = value.split(".").map(Number);
	const date = value.split(".")[1];
	const parsed = new Date(
		`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T00:00:00Z`,
	);
	if (
		!Number.isFinite(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10).replaceAll("-", "") !== date
	)
		refuse("Invalid workerd version");
	return parts;
}
function older(left, right) {
	const a = versionParts(left),
		b = versionParts(right);
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
	return false;
}
function validatePackage(metadata, name, version, arch) {
	if (
		metadata.name !== name ||
		metadata.version !== version ||
		metadata.os?.length !== 1 ||
		metadata.os[0] !== "linux" ||
		metadata.cpu?.length !== 1 ||
		metadata.cpu[0] !== arch
	)
		refuse("Vendor package identity mismatch");
}
function readMetadata(path) {
	if (!lstatSync(path).isFile() || lstatSync(path).size > 64 * 1024)
		refuse("Invalid package metadata");
	return JSON.parse(readFileSync(path, "utf8"));
}
function validateOutput(path) {
	if (
		!isAbsolute(path) ||
		dirname(resolve(path)) !== realpathSync(dirname(path))
	)
		refuse("Runtime output must have a real absolute parent directory");
	try {
		lstatSync(path);
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	refuse("Runtime output already exists");
}
function validateElf(path, arch) {
	const fd = openSync(path, "r");
	try {
		const header = Buffer.alloc(20);
		if (
			readSync(fd, header, 0, 20, 0) !== 20 ||
			!header
				.subarray(0, 6)
				.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1])) ||
			header.readUInt16LE(18) !== (arch === "arm64" ? 183 : 62)
		)
			refuse("Vendor binary ELF architecture mismatch");
	} finally {
		closeSync(fd);
	}
}
async function writeBounded(stream, path, limit, hash) {
	const fd = openSync(path, "wx", 0o600);
	let total = 0;
	try {
		for await (const chunk of stream) {
			total += chunk.length;
			if (total > limit) refuse("Runtime artifact exceeds size limit");
			hash?.update(chunk);
			let offset = 0;
			while (offset < chunk.length)
				offset += writeSync(fd, chunk, offset, chunk.length - offset);
		}
	} finally {
		closeSync(fd);
	}
}
async function response(fetch, url) {
	const result = await fetch(url, {
		redirect: "manual",
		credentials: "omit",
		signal: AbortSignal.timeout(15_000),
	});
	if (result.status !== 200 || result.redirected || !result.body)
		refuse("Vendor registry request refused");
	return result;
}
async function metadataResponse(result) {
	const chunks = [];
	let size = 0;
	const reader = result.body.getReader();
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > 64 * 1024) refuse("Vendor metadata exceeds size limit");
			chunks.push(value);
		}
	} finally {
		await reader.cancel();
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function tar(args, output, limit = 1024 * 1024) {
	const child = spawn("tar", args, {
		env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let expired = false,
		diagnosticSize = 0;
	const timeout = setTimeout(() => {
		expired = true;
		child.kill("SIGKILL");
	}, 15_000);
	const closed = new Promise((resolveClose, reject) => {
		child.once("error", reject);
		child.once("close", (code) => resolveClose(code));
	});
	child.stderr.on("data", (chunk) => {
		diagnosticSize += chunk.length;
		if (diagnosticSize > 64 * 1024) child.kill("SIGKILL");
	});
	const chunks = [];
	try {
		if (output) await writeBounded(child.stdout, output, limit);
		else {
			let size = 0;
			for await (const chunk of child.stdout) {
				size += chunk.length;
				if (size > limit) refuse("Vendor archive listing exceeds size limit");
				chunks.push(chunk);
			}
		}
		if ((await closed) !== 0 || expired || diagnosticSize > 64 * 1024)
			refuse("Vendor archive could not be read");
		return Buffer.concat(chunks).toString("utf8");
	} catch (error) {
		child.kill("SIGKILL");
		await closed.catch(() => {});
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}
async function extractArchive(archive, temporary, name, version, arch) {
	const raw = join(temporary, "vendor.tar");
	await pipeline(createReadStream(archive), createGunzip(), async (stream) => {
		await writeBounded(stream, raw, TAR_LIMIT);
	});
	const names = (await tar(["-tf", raw])).trim().split("\n");
	if (
		names.some(
			(name) => name.startsWith("/") || name.split("/").includes(".."),
		) ||
		MEMBERS.some(
			(member) => names.filter((name) => name === member).length !== 1,
		)
	)
		refuse("Vendor archive required members are invalid or duplicated");
	const listing = (await tar(["-tvf", raw, "--", ...MEMBERS]))
		.trim()
		.split("\n");
	if (
		listing.length !== 2 ||
		listing.some(
			(line) =>
				!line.startsWith("-") ||
				!MEMBERS.some((member) => line.endsWith(` ${member}`)),
		)
	)
		refuse("Vendor archive required members must be regular files");
	const metadata = await tar(
		["-xOf", raw, "--", MEMBERS[0]],
		undefined,
		64 * 1024,
	);
	validatePackage(JSON.parse(metadata), name, version, arch);
	const binary = join(temporary, "workerd");
	await tar(["-xOf", raw, "--", MEMBERS[1]], binary, BINARY_LIMIT);
	return binary;
}

export async function selectWorkerd(options, boundaries = {}) {
	const platform = boundaries.platform ?? process.platform,
		arch = boundaries.arch ?? process.arch;
	if (platform !== "linux" || !["arm64", "x64"].includes(arch))
		refuse("Unsupported workerd platform");
	validateOutput(options.outputPath);
	validateOutput(options.provenancePath);
	if (resolve(options.outputPath) === resolve(options.provenancePath))
		refuse("Runtime outputs must be distinct");
	const wrangler = readMetadata(options.wranglerPackage),
		own = createRequire(options.wranglerPackage);
	const metadataPath = own.resolve("workerd/package.json"),
		pkg = readMetadata(metadataPath);
	versionParts(pkg.version);
	if (
		wrangler.name !== "wrangler" ||
		pkg.name !== "workerd" ||
		pkg.version !== wrangler.dependencies?.workerd
	)
		refuse("Installed workerd does not match locked Wrangler dependency");
	const name = `@cloudflare/workerd-linux-${arch === "arm64" ? "arm64" : "64"}`;
	if (pkg.optionalDependencies?.[name] !== pkg.version)
		refuse("Vendor package does not match locked workerd dependency");
	const override = options.overrideVersion || options.overrideSha512;
	if (override && (!options.overrideVersion || !options.overrideSha512))
		refuse("Runtime override version and integrity must be set together");
	const selected = override ? options.overrideVersion : pkg.version;
	versionParts(selected);
	if (older(selected, pkg.version))
		refuse("Runtime override must not downgrade locked workerd");
	if (options.minimumVersion && older(selected, options.minimumVersion))
		refuse("Selected runtime is older than the required minimum");
	let integrity;
	if (override) {
		if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(options.overrideSha512))
			refuse("Runtime override requires a SHA512 integrity pin");
		integrity = Buffer.from(options.overrideSha512.slice(7), "base64");
		if (
			integrity.length !== 64 ||
			`sha512-${integrity.toString("base64")}` !== options.overrideSha512
		)
			refuse("Invalid runtime override integrity");
	}
	const temporary = mkdtempSync(join(dirname(options.outputPath), ".workerd-"));
	let recordTemporary;
	const created = [];
	try {
		recordTemporary = mkdtempSync(
			join(dirname(options.provenancePath), ".workerd-record-"),
		);
		let binary;
		if (override) {
			const fetch = boundaries.fetch ?? globalThis.fetch;
			const metadata = await metadataResponse(
				await response(
					fetch,
					`https://registry.npmjs.org/${encodeURIComponent(name)}/${selected}`,
				),
			);
			validatePackage(metadata, name, selected, arch);
			if (metadata.dist?.integrity !== options.overrideSha512)
				refuse("Vendor metadata integrity differs from pinned integrity");
			const url = new URL(metadata.dist.tarball);
			const artifactPath = `/${name}/-/${name.split("/")[1]}-${selected}.tgz`;
			if (
				url.protocol !== "https:" ||
				url.hostname !== "registry.npmjs.org" ||
				url.port ||
				url.username ||
				url.password ||
				url.search ||
				url.hash ||
				url.pathname !== artifactPath
			)
				refuse(
					"Vendor artifact must use the official registry exact-version URL",
				);
			const result = await response(fetch, url.href),
				archive = join(temporary, "vendor.tgz"),
				hash = createHash("sha512");
			await writeBounded(result.body, archive, ARCHIVE_LIMIT, hash);
			if (!timingSafeEqual(hash.digest(), integrity))
				refuse("Vendor archive integrity mismatch");
			binary = await extractArchive(archive, temporary, name, selected, arch);
		} else {
			const leafRequire = createRequire(metadataPath),
				leafMetadata = leafRequire.resolve(`${name}/package.json`);
			validatePackage(readMetadata(leafMetadata), name, selected, arch);
			const installed = leafRequire.resolve(`${name}/bin/workerd`),
				root = realpathSync(dirname(leafMetadata)),
				relativePath = relative(root, realpathSync(installed));
			if (
				!lstatSync(installed).isFile() ||
				relativePath.startsWith("..") ||
				isAbsolute(relativePath)
			)
				refuse("Vendor binary must be a regular file within its package");
			binary = join(temporary, "workerd");
			await writeBounded(createReadStream(installed), binary, BINARY_LIMIT);
		}
		validateElf(binary, arch);
		const hash = createHash("sha256");
		for await (const chunk of createReadStream(binary)) hash.update(chunk);
		const record = {
			source: override ? "override" : "locked",
			version: selected,
			package: name,
			platform,
			arch,
			sha256: hash.digest("hex"),
			...(override ? { integrity: options.overrideSha512 } : {}),
		};
		chmodSync(binary, 0o755);
		const recordPath = join(recordTemporary, "workerd-runtime.json");
		writeFileSync(recordPath, `${JSON.stringify(record)}\n`, {
			flag: "wx",
			mode: 0o644,
		});
		linkSync(binary, options.outputPath);
		created.push(options.outputPath);
		linkSync(recordPath, options.provenancePath);
		created.push(options.provenancePath);
		return record;
	} catch (error) {
		for (const path of created) rmSync(path);
		throw error;
	} finally {
		rmSync(temporary, { recursive: true, force: true });
		if (recordTemporary)
			rmSync(recordTemporary, { recursive: true, force: true });
	}
}

if (
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
	try {
		const own = createRequire(join(process.cwd(), "package.json"));
		await selectWorkerd({
			wranglerPackage: own.resolve("wrangler/package.json"),
			outputPath: "/bundle/workerd",
			provenancePath: "/bundle/workerd-runtime.json",
			minimumVersion: process.env.WORKERD_MINIMUM_VERSION || undefined,
			overrideVersion: process.env.WORKERD_OVERRIDE_VERSION || undefined,
			overrideSha512: process.env.WORKERD_OVERRIDE_SHA512 || undefined,
		});
	} catch (error) {
		console.error(
			error instanceof RuntimeError
				? error.message
				: "Workerd runtime could not be selected",
		);
		process.exitCode = 1;
	}
}
