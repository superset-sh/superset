#!/usr/bin/env node

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

function parseArgs(argv) {
	const args = {
		arm64Dir: "",
		x64Dir: "",
		output: "",
		extraManifestNames: "",
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const value = argv[index + 1];

		switch (arg) {
			case "--arm64-dir":
				args.arm64Dir = value ?? "";
				index += 1;
				break;
			case "--x64-dir":
				args.x64Dir = value ?? "";
				index += 1;
				break;
			case "--output":
				args.output = value ?? "";
				index += 1;
				break;
			case "--extra-manifest-names":
				args.extraManifestNames = value ?? "";
				index += 1;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	if (!args.output) {
		throw new Error("Missing required argument: --output");
	}

	return args;
}

function findManifest(dir) {
	if (!dir || !existsSync(dir)) {
		return null;
	}

	const stack = [dir];
	while (stack.length > 0) {
		const currentDir = stack.pop();
		const entries = readdirSync(currentDir, {
			withFileTypes: true,
		}).sort((left, right) => left.name.localeCompare(right.name));

		for (const entry of entries) {
			const entryPath = join(currentDir, entry.name);
			if (entry.isDirectory()) {
				stack.push(entryPath);
				continue;
			}

			if (entry.isFile() && entry.name.endsWith("-mac.yml")) {
				return entryPath;
			}
		}
	}

	return null;
}

function stripQuotes(value) {
	if (
		(value.startsWith("'") && value.endsWith("'")) ||
		(value.startsWith('"') && value.endsWith('"'))
	) {
		return value.slice(1, -1);
	}

	return value;
}

function parseScalar(key, value) {
	const trimmed = value.trim();
	if (trimmed === "") {
		return "";
	}

	const unquoted = stripQuotes(trimmed);
	if (key === "size" && /^-?\d+$/.test(unquoted)) {
		return Number(unquoted);
	}

	return unquoted;
}

function parseKeyValue(rawLine) {
	const separatorIndex = rawLine.indexOf(":");
	if (separatorIndex === -1) {
		throw new Error(`Invalid YAML line: ${rawLine}`);
	}

	const key = rawLine.slice(0, separatorIndex).trim();
	const value = rawLine.slice(separatorIndex + 1);
	return [key, value];
}

function parseManifest(filePath) {
	const lines = readFileSync(filePath, "utf8")
		.replaceAll("\r\n", "\n")
		.split("\n");
	const manifest = {};

	let index = 0;
	while (index < lines.length) {
		const line = lines[index];
		const trimmed = line.trim();

		if (trimmed === "" || trimmed === "---") {
			index += 1;
			continue;
		}

		if (line.startsWith("files:")) {
			const files = [];
			index += 1;

			while (index < lines.length) {
				const fileLine = lines[index];
				const fileTrimmed = fileLine.trim();

				if (fileTrimmed === "") {
					index += 1;
					continue;
				}

				if (!fileLine.startsWith("  - ")) {
					break;
				}

				const fileEntry = {};
				const [firstKey, firstValue] = parseKeyValue(fileLine.slice(4));
				fileEntry[firstKey] = parseScalar(firstKey, firstValue);
				index += 1;

				while (index < lines.length) {
					const nestedLine = lines[index];
					const nestedTrimmed = nestedLine.trim();

					if (nestedTrimmed === "") {
						index += 1;
						continue;
					}

					if (!nestedLine.startsWith("    ")) {
						break;
					}

					const [nestedKey, nestedValue] = parseKeyValue(nestedLine.slice(4));
					fileEntry[nestedKey] = parseScalar(nestedKey, nestedValue);
					index += 1;
				}

				files.push(fileEntry);
			}

			manifest.files = files;
			continue;
		}

		if (line.startsWith(" ") || line.startsWith("\t")) {
			throw new Error(
				`Unsupported nested YAML structure in ${filePath}: ${line}`,
			);
		}

		const [key, value] = parseKeyValue(line);
		manifest[key] = parseScalar(key, value);
		index += 1;
	}

	if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
		throw new Error(`Manifest ${filePath} is missing files[] entries`);
	}

	return manifest;
}

function yamlQuote(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function stringifyManifest(manifest) {
	const lines = [];

	for (const [key, value] of Object.entries(manifest)) {
		if (key === "files") {
			lines.push("files:");
			for (const file of value) {
				lines.push(`  - url: ${yamlQuote(file.url)}`);
				lines.push(`    sha512: ${yamlQuote(file.sha512)}`);
				if (typeof file.size === "number") {
					lines.push(`    size: ${file.size}`);
				}
			}
			continue;
		}

		if (typeof value === "number") {
			lines.push(`${key}: ${value}`);
			continue;
		}

		lines.push(`${key}: ${yamlQuote(value)}`);
	}

	return `${lines.join("\n")}\n`;
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const arm64ManifestPath = findManifest(args.arm64Dir);
	const x64ManifestPath = findManifest(args.x64Dir);

	mkdirSync(dirname(args.output), { recursive: true });

	if (arm64ManifestPath && x64ManifestPath) {
		const arm64Manifest = parseManifest(arm64ManifestPath);
		const x64Manifest = parseManifest(x64ManifestPath);
		const mergedManifest = {
			...arm64Manifest,
		};
		mergedManifest.files = [...arm64Manifest.files, ...x64Manifest.files];
		writeFileSync(args.output, stringifyManifest(mergedManifest));
		console.log("Merged arm64 + x64 manifests into latest-mac.yml");
	} else if (arm64ManifestPath) {
		copyFileSync(arm64ManifestPath, args.output);
		console.log("Using arm64-only manifest");
	} else if (x64ManifestPath) {
		copyFileSync(x64ManifestPath, args.output);
		console.log("Using x64-only manifest");
	} else {
		throw new Error("No macOS update manifests were found to merge");
	}

	const extraNames = args.extraManifestNames
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);

	for (const name of extraNames) {
		const copyPath = join(dirname(args.output), name);
		copyFileSync(args.output, copyPath);
		console.log(`Created copy: ${name}`);
	}

	console.log("Final latest-mac.yml:");
	process.stdout.write(readFileSync(args.output, "utf8"));
}

try {
	main();
} catch (error) {
	console.error(
		`::error::${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
}
