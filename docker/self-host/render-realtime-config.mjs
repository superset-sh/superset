import { randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	lstatSync,
	openSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";

class RealtimeConfigError extends Error {}
const refuse = (message) => {
	throw new RealtimeConfigError(message);
};

function validateUrl(name, root) {
	const value = process.env[name];
	if (!/^https?:\/\/[^/?#\s\\%@]+(?:\/[^?#\s\\]*)?$/i.test(value))
		refuse(`Realtime requires a valid ${name}`);
	let url;
	try {
		url = new URL(value);
	} catch {
		refuse(`Realtime requires a valid ${name}`);
	}
	if (
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		(root && url.pathname !== "/")
	)
		refuse(`Realtime requires a valid ${name}`);
}

function render() {
	const [template, output, ...extra] = process.argv.slice(2);
	if (
		!template ||
		!output ||
		extra.length ||
		resolve(template) === resolve(output)
	)
		refuse("Realtime template and separate output are required");
	for (const name of [
		"NEXT_PUBLIC_API_URL",
		"USERCONTENT_URL",
		"NUDGE_SECRET",
		"S3_ENDPOINT",
		"S3_BUCKET",
		"S3_ACCESS_KEY",
		"S3_SECRET_KEY",
	])
		if (!process.env[name]?.trim())
			refuse(`Realtime configuration missing ${name}`);
	validateUrl("NEXT_PUBLIC_API_URL", true);
	validateUrl("USERCONTENT_URL", true);
	validateUrl("S3_ENDPOINT", false);
	const addresses = (process.env.REALTIME_PRIVATE_ADDRESSES || "").trim();
	const values = addresses
		? addresses.split(",").map((value) => value.trim())
		: [];
	if (
		addresses.length > 4096 ||
		values.length > 64 ||
		values.some((value) => !isIP(value) || value.includes("%"))
	)
		refuse("Realtime private exceptions must be exact IP addresses");
	const source = readFileSync(template, "utf8");
	const markers = ["@PRIVATE_ADDRESSES@", "@OPTIONAL_BINDINGS@"];
	if (
		markers.some((marker) => source.split(marker).length !== 2) ||
		[...source.matchAll(/@[A-Z_]+@/g)].some(
			([marker]) => !markers.includes(marker),
		)
	)
		refuse("Invalid realtime configuration template");
	try {
		if (!lstatSync(output).isFile())
			refuse("Realtime output must be a regular file");
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const allowed = [...new Set(values)]
		.map((value) => `, "${value}/${isIP(value) === 4 ? 32 : 128}"`)
		.join("");
	const optional = ["S3_REGION", "SENTRY_DSN"]
		.filter((name) => process.env[name]?.trim())
		.map((name) => `(name = "${name}", fromEnvironment = "${name}"),`)
		.join("\n    ");
	const rendered = source
		.replace("@PRIVATE_ADDRESSES@", allowed)
		.replace("@OPTIONAL_BINDINGS@", optional);
	const temporary = `${output}.${randomUUID()}.tmp`;
	try {
		const fd = openSync(temporary, "wx", 0o600);
		try {
			writeFileSync(fd, rendered);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		renameSync(temporary, output);
		const directory = openSync(dirname(resolve(output)), "r");
		try {
			fsyncSync(directory);
		} finally {
			closeSync(directory);
		}
	} finally {
		if (existsSync(temporary)) unlinkSync(temporary);
	}
}

try {
	render();
} catch (error) {
	console.error(
		error instanceof RealtimeConfigError
			? error.message
			: `Realtime configuration could not be prepared: ${error.code || error.name}; template=${process.argv[2]}; output=${process.argv[3]}`,
	);
	process.exit(1);
}
