/**
 * A deterministic tar.gz writer: sorted entries, zero mtimes, root ownership,
 * fixed modes. The bundle's sha256 is its tarball's, so the bytes must be the
 * same on every machine that builds the same tree, and the system `tar`
 * differs between macOS and Linux in both flags and output.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative } from "node:path";

const BLOCK = 512;

function header(
	name: string,
	size: number,
	mode: number,
	type: "0" | "5",
): Uint8Array {
	if (Buffer.byteLength(name) > 100) {
		// ustar splits long names into prefix/name; the bundle's paths are short.
		throw new Error(`tar entry name too long: ${name}`);
	}
	const h = Buffer.alloc(BLOCK);
	h.write(name, 0, 100);
	h.write(mode.toString(8).padStart(7, "0"), 100, 8);
	h.write("0000000", 108, 8); // uid
	h.write("0000000", 116, 8); // gid
	h.write(size.toString(8).padStart(11, "0"), 124, 12);
	h.write("00000000000", 136, 12); // mtime 0
	h.write("        ", 148, 8); // checksum placeholder
	h.write(type, 156, 1);
	h.write("ustar", 257, 6);
	h.write("00", 263, 2);
	h.write("root", 265, 32);
	h.write("root", 297, 32);
	let sum = 0;
	for (const byte of h) sum += byte;
	h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
	return h;
}

function pad(size: number): Uint8Array {
	const rest = size % BLOCK;
	return new Uint8Array(rest === 0 ? 0 : BLOCK - rest);
}

/** Every path under `dir`, directories first within their parent, sorted by name. */
function entries(
	dir: string,
	base = dir,
): Array<{ path: string; full: string; dir: boolean }> {
	const out: Array<{ path: string; full: string; dir: boolean }> = [];
	for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
		a.name.localeCompare(b.name),
	)) {
		const full = join(dir, entry.name);
		const path = posix.join(...relative(base, full).split(/[\\/]/));
		if (entry.isDirectory()) {
			out.push({ path: `${path}/`, full, dir: true });
			out.push(...entries(full, base));
		} else {
			out.push({ path, full, dir: false });
		}
	}
	return out;
}

export function tarGzDirectory(dir: string): Uint8Array {
	const parts: Uint8Array[] = [];
	for (const entry of entries(dir)) {
		if (entry.dir) {
			parts.push(header(`./${entry.path}`, 0, 0o755, "5"));
			continue;
		}
		const bytes = readFileSync(entry.full);
		const executable = (statSync(entry.full).mode & 0o111) !== 0;
		parts.push(
			header(`./${entry.path}`, bytes.length, executable ? 0o755 : 0o644, "0"),
			bytes,
			pad(bytes.length),
		);
	}
	parts.push(new Uint8Array(BLOCK * 2));
	const tar = Buffer.concat(parts);
	// zlib writes a zero mtime and no name into the gzip header, so the
	// output depends on the tar bytes alone.
	return Bun.gzipSync(tar, { level: 9 });
}
