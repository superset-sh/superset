import type { SimpleGit } from "simple-git";
import type { DiffCategory, DiffCategoryRefs } from "./git-helpers.ts";

export type DiffSide = "old" | "new";

export type DiffSideBlob =
	| { kind: "bytes"; content: Buffer; byteLength: number; exceededLimit: false }
	| { kind: "bytes"; content: null; byteLength: number; exceededLimit: true }
	| { kind: "missing" };

/** The git object each side of a category's diff is read from. Mirrors the
 * ref pairs `loadFileDiffContent` and `diffArgsForCategory` compare, so a
 * preview always shows the same two versions the text diff would. Returns
 * null for the one side that is not a git object: the unstaged "new" side is
 * the working tree and is read through the filesystem instead. */
export function diffSideObjectSpec(
	category: DiffCategory,
	side: DiffSide,
	path: string,
	refs: DiffCategoryRefs,
): string | null {
	if (category === "against-base") {
		return side === "old"
			? `${refs.originRef ?? "HEAD"}:${path}`
			: `HEAD:${path}`;
	}
	if (category === "commit") {
		return side === "old"
			? `${refs.fromRef ?? "HEAD^"}:${path}`
			: `${refs.toRef ?? "HEAD"}:${path}`;
	}
	if (category === "staged") {
		return side === "old" ? `HEAD:${path}` : `:0:${path}`;
	}
	return side === "old" ? `:0:${path}` : null;
}

/** Reads one blob by object spec. The spec is resolved to its object id
 * first, so the size check and the read describe the same blob even if HEAD
 * or the index moves between the two commands. Size is checked before the
 * bytes are fetched, so a huge asset costs a `cat-file -s` and nothing else.
 * A spec that doesn't resolve (added file's old side, deleted file's new
 * side, untracked path in the index) reports `missing` rather than throwing. */
export async function readDiffSideBlob(
	git: SimpleGit,
	spec: string,
	maxBytes: number,
): Promise<DiffSideBlob> {
	let oid: string;
	try {
		oid = (await git.raw(["rev-parse", "--verify", "--quiet", spec])).trim();
	} catch {
		return { kind: "missing" };
	}
	if (!oid) return { kind: "missing" };
	const size = Number.parseInt(
		(await git.raw(["cat-file", "-s", oid])).trim(),
		10,
	);
	if (!Number.isFinite(size)) {
		throw new Error(`git cat-file -s ${oid} returned no size`);
	}
	if (size > maxBytes) {
		return {
			kind: "bytes",
			content: null,
			byteLength: size,
			exceededLimit: true,
		};
	}
	const content = (await git.binaryCatFile(["-p", oid])) as Buffer;
	return {
		kind: "bytes",
		content,
		byteLength: content.byteLength,
		exceededLimit: false,
	};
}
