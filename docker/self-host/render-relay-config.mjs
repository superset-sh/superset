import { randomBytes, randomUUID } from "node:crypto";
import {
	closeSync,
	fsyncSync,
	linkSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { isIP } from "node:net";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";

class RelayConfigError extends Error {}
const refuse = (message) => {
	throw new RelayConfigError(message);
};
const validKey = (key) => /^[0-9A-Za-z_-]+$/.test(key);

function fileStat(path) {
	try {
		return lstatSync(path);
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
}
function storedKey(path) {
	const stat = fileStat(path);
	if (!stat) return null;
	if (!stat.isFile() || stat.mode & 0o077)
		refuse("Relay namespace key must be a private regular file");
	const key = readFileSync(path, "utf8").replace(/\n+$/, "");
	if (!validKey(key)) refuse("Invalid stored relay namespace key");
	return key;
}
function syncDirectory(path) {
	const fd = openSync(path, "r");
	try {
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}
function writePrivate(path, value) {
	const fd = openSync(path, "wx", 0o600);
	try {
		writeFileSync(fd, value);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}
function namespaceKey(directory, configured) {
	const path = join(directory, ".do-unique-key"),
		existing = storedKey(path);
	if (existing) {
		if (configured && configured !== existing)
			refuse("Configured relay namespace key conflicts with stored data");
		return existing;
	}
	const desired = configured || randomBytes(16).toString("hex"),
		temporary = `${path}.${randomUUID()}.tmp`;
	try {
		writePrivate(temporary, desired);
		try {
			linkSync(temporary, path);
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
		syncDirectory(directory);
		const selected = storedKey(path);
		if (!selected || (configured && configured !== selected))
			refuse("Relay namespace key creation conflicted");
		return selected;
	} finally {
		if (fileStat(temporary)) unlinkSync(temporary);
	}
}
function contains(parent, child) {
	const path = relative(parent, child);
	return !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}
function render() {
	const [template, rendered, ...extra] = process.argv.slice(2);
	if (!template || !rendered || extra.length)
		refuse("Relay template and output are required");
	if (
		resolve(template) === resolve(rendered) ||
		(fileStat(rendered) && realpathSync(template) === realpathSync(rendered))
	)
		refuse("Relay template and output must be separate files");
	const api = process.env.NEXT_PUBLIC_API_URL || "";
	if (!/^https?:\/\/[^/?#\s\\%@]+\/?$/i.test(api))
		refuse(
			"Relay requires NEXT_PUBLIC_API_URL to be an API root origin without credentials",
		);
	let origin;
	try {
		origin = new URL(api);
	} catch {
		refuse(
			"Relay requires NEXT_PUBLIC_API_URL to be an API root origin without credentials",
		);
	}
	if (
		!["http:", "https:"].includes(origin.protocol) ||
		origin.username ||
		origin.password ||
		origin.pathname !== "/" ||
		origin.search ||
		origin.hash
	)
		refuse(
			"Relay requires NEXT_PUBLIC_API_URL to be an API root origin without credentials",
		);
	const configured = process.env.RELAY2_DO_UNIQUE_KEY || "";
	if (configured && !validKey(configured))
		refuse("Invalid configured relay namespace key");
	const addresses = (process.env.RELAY2_API_PRIVATE_ADDRESSES || "").trim();
	const values = addresses
		? addresses.split(",").map((value) => value.trim())
		: [];
	if (
		addresses.length > 4096 ||
		values.length > 64 ||
		values.some((value) => !isIP(value) || value.includes("%"))
	)
		refuse("Relay private exceptions must be exact IP addresses");
	const source = readFileSync(template, "utf8"),
		markers = [
			"@DO_UNIQUE_KEY@",
			"@API_PRIVATE_ADDRESSES@",
			"@OPTIONAL_BINDINGS@",
		];
	if (
		markers.some((marker) => source.split(marker).length !== 2) ||
		[...source.matchAll(/@[A-Z_]+@/g)].some(
			([marker]) => !markers.includes(marker),
		)
	)
		refuse("Invalid relay configuration template");
	const doDir = process.env.RELAY2_DO_DIR || "/data/durable-objects",
		placementDir = process.env.RELAY2_PLACEMENT_DIR || "/data/placement";
	if (!isAbsolute(doDir) || !isAbsolute(placementDir))
		refuse("Relay storage paths must be absolute");
	mkdirSync(doDir, { recursive: true });
	mkdirSync(placementDir, { recursive: true });
	const doPath = realpathSync(doDir),
		placementPath = realpathSync(placementDir);
	if (contains(doPath, placementPath) || contains(placementPath, doPath))
		refuse("Relay storage directories must be separate");
	const output = join(
		realpathSync(dirname(resolve(rendered))),
		basename(rendered),
	);
	if (
		output === join(doPath, ".do-unique-key") ||
		(fileStat(output) && !fileStat(output).isFile())
	)
		refuse("Relay output must be a separate regular file");
	const key = namespaceKey(doPath, configured);
	const allowed = [...new Set(values)]
		.map((value) => `, "${value}/${isIP(value) === 4 ? 32 : 128}"`)
		.join("");
	const sentry = process.env.SENTRY_DSN?.trim()
		? '(name = "SENTRY_DSN", fromEnvironment = "SENTRY_DSN"),'
		: "";
	const result = source
		.replace("@DO_UNIQUE_KEY@", key)
		.replace("@API_PRIVATE_ADDRESSES@", allowed)
		.replace("@OPTIONAL_BINDINGS@", sentry);
	const temporary = `${output}.${randomUUID()}.tmp`;
	try {
		writePrivate(temporary, result);
		renameSync(temporary, output);
		syncDirectory(dirname(output));
	} finally {
		if (fileStat(temporary)) unlinkSync(temporary);
	}
}
try {
	render();
} catch (error) {
	console.error(
		error instanceof RelayConfigError
			? error.message
			: "Relay configuration could not be prepared",
	);
	process.exit(1);
}
