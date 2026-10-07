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

class UsercontentConfigError extends Error {}
const refuse = (message) => {
	throw new UsercontentConfigError(message);
};

function validateUrl(name) {
	let url;
	try {
		url = new URL(process.env[name]);
	} catch {
		refuse(`Usercontent requires a valid ${name}`);
	}
	if (
		!["http:", "https:"].includes(url.protocol) ||
		url.username ||
		url.password ||
		(name === "S3_ENDPOINT" && (url.search || url.hash))
	)
		refuse(`Usercontent requires a valid ${name}`);
}

function render() {
	const [template, output, ...extra] = process.argv.slice(2);
	if (
		!template ||
		!output ||
		extra.length ||
		resolve(template) === resolve(output)
	)
		refuse("Usercontent template and separate output are required");
	for (const name of [
		"USERCONTENT_URL",
		"MEDIA_URL",
		"APP_URL",
		"REALTIME_URL",
		"FRAME_ANCESTORS",
		"USERCONTENT_TOKEN_SECRET",
		"S3_ENDPOINT",
		"S3_BUCKET",
		"S3_ACCESS_KEY",
		"S3_SECRET_KEY",
	])
		if (!process.env[name]?.trim())
			refuse(`Usercontent configuration missing ${name}`);
	for (const name of [
		"USERCONTENT_TOKEN_SECRET",
		"USERCONTENT_TOKEN_SECRET_PREVIOUS",
	])
		if (process.env[name]?.trim() && process.env[name].length < 32)
			refuse(`Usercontent requires ${name} to contain at least 32 characters`);
	for (const name of [
		"USERCONTENT_URL",
		"MEDIA_URL",
		"APP_URL",
		"REALTIME_URL",
		"S3_ENDPOINT",
	])
		validateUrl(name);
	const addresses = (process.env.USERCONTENT_PRIVATE_ADDRESSES || "").trim();
	const values = addresses
		? addresses.split(",").map((value) => value.trim())
		: [];
	if (
		addresses.length > 4096 ||
		values.length > 64 ||
		values.some((value) => !isIP(value) || value.includes("%"))
	)
		refuse("Usercontent private exceptions must be exact IP addresses");
	const source = readFileSync(template, "utf8");
	const markers = ["@PRIVATE_ADDRESSES@", "@OPTIONAL_BINDINGS@"];
	if (
		markers.some((marker) => source.split(marker).length !== 2) ||
		[...source.matchAll(/@[A-Z_]+@/g)].some(
			([marker]) => !markers.includes(marker),
		)
	)
		refuse("Invalid usercontent configuration template");
	try {
		if (!lstatSync(output).isFile())
			refuse("Usercontent output must be a regular file");
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const allowed = [...new Set(values)]
		.map((value) => `, "${value}/${isIP(value) === 4 ? 32 : 128}"`)
		.join("");
	const optional = [
		"S3_REGION",
		"SENTRY_DSN",
		"USERCONTENT_TOKEN_SECRET_PREVIOUS",
	]
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
		error instanceof UsercontentConfigError
			? error.message
			: "Usercontent configuration could not be prepared",
	);
	process.exit(1);
}
