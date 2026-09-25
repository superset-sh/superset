import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { WORKSPACE_ATTACHMENTS_DIR } from "@superset/shared/workspace-attachments";
import {
	PasteUploadLimitError,
	type UploadPastedFilesDeps,
	uploadPastedFiles,
} from "./uploadPastedFiles";

// fileToBase64 goes through FileReader.readAsDataURL, which the renderer has
// but Bun's test runtime may not — pin a minimal implementation over
// Blob.arrayBuffer so the tests exercise the real base64 pipeline.
let fileReads = 0;

class TestFileReader {
	result: string | null = null;
	error: Error | null = null;
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;

	readAsDataURL(file: File) {
		fileReads += 1;
		file
			.arrayBuffer()
			.then((buffer) => {
				const base64 = Buffer.from(buffer).toString("base64");
				this.result = `data:${file.type};base64,${base64}`;
				this.onload?.();
			})
			.catch((error) => {
				this.error = error;
				this.onerror?.();
			});
	}
}

const originalFileReader = (globalThis as { FileReader?: unknown }).FileReader;

beforeAll(() => {
	(globalThis as { FileReader?: unknown }).FileReader = TestFileReader;
});

afterAll(() => {
	(globalThis as { FileReader?: unknown }).FileReader = originalFileReader;
});

interface RecordedWrite {
	absolutePath: string;
	content: string | { kind: "base64"; data: string };
	options: { create: boolean; overwrite: boolean };
}

/**
 * Fake deps backed by a real "directory": create-only writes report "exists"
 * on a name collision exactly like the host does, so the collision-probing
 * naming is exercised for real.
 */
function makeDeps(options: { existing?: string[]; failWrites?: boolean } = {}) {
	const createdDirs: string[] = [];
	const writes: RecordedWrite[] = [];
	const existing = new Set(options.existing ?? []);
	const deps: UploadPastedFilesDeps = {
		async createDirectory(input) {
			createdDirs.push(input.absolutePath);
		},
		async writeFile(input) {
			const write: RecordedWrite = {
				absolutePath: input.absolutePath,
				content: input.content,
				options: input.options,
			};
			writes.push(write);
			if (options.failWrites && !input.absolutePath.endsWith(".gitignore")) {
				return { ok: false, reason: "conflict" };
			}
			if (existing.has(input.absolutePath) && !input.options.overwrite) {
				return { ok: false, reason: "exists" };
			}
			existing.add(input.absolutePath);
			return { ok: true };
		},
	};
	return { deps, createdDirs, writes };
}

const WORKTREE = "/home/user/.superset/worktrees/demo";
const DIR_ABS = `${WORKTREE}/${WORKSPACE_ATTACHMENTS_DIR}`;

describe("uploadPastedFiles", () => {
	it("creates the attachments dir, self-ignores it, writes each file, returns relative paths", async () => {
		const { deps, createdDirs, writes } = makeDeps();
		const files = [
			new File([new Uint8Array([1, 2, 3])], "image.png", {
				type: "image/png",
			}),
			new File([new Uint8Array([4, 5])], "notes.pdf", {
				type: "application/pdf",
			}),
		];

		const paths = await uploadPastedFiles({
			deps,
			workspaceId: "ws-1",
			worktreePath: WORKTREE,
			files,
		});

		expect(createdDirs).toEqual([DIR_ABS]);
		expect(writes[0]).toEqual({
			absolutePath: `${DIR_ABS}/.gitignore`,
			content: "*\n",
			// create-only: a user's own .gitignore edit is never clobbered.
			options: { create: true, overwrite: false },
		});
		// Worktree-relative, matching the agent-launch and mobile convention.
		expect(paths).toEqual([
			`${WORKSPACE_ATTACHMENTS_DIR}/image.png`,
			`${WORKSPACE_ATTACHMENTS_DIR}/notes.pdf`,
		]);
		expect(writes[1]?.options).toEqual({ create: true, overwrite: false });
		expect(writes[1]?.content).toEqual({
			kind: "base64",
			data: Buffer.from([1, 2, 3]).toString("base64"),
		});
	});

	it("never overwrites an earlier paste — collisions probe to a fresh _N name", async () => {
		const { deps, writes } = makeDeps({
			existing: [`${DIR_ABS}/image.png`, `${DIR_ABS}/image_1.png`],
		});

		const paths = await uploadPastedFiles({
			deps,
			workspaceId: "ws-1",
			worktreePath: WORKTREE,
			files: [new File(["x"], "image.png", { type: "image/png" })],
		});

		expect(paths).toEqual([`${WORKSPACE_ATTACHMENTS_DIR}/image_2.png`]);
		// Every probe was create-only; nothing was written over.
		expect(writes.every((w) => w.options.overwrite === false)).toBe(true);
	});

	it("tolerates a .gitignore that already exists from an earlier paste", async () => {
		const { deps } = makeDeps({ existing: [`${DIR_ABS}/.gitignore`] });

		const paths = await uploadPastedFiles({
			deps,
			workspaceId: "ws-1",
			worktreePath: WORKTREE,
			files: [new File(["x"], "image.png", { type: "image/png" })],
		});

		expect(paths).toEqual([`${WORKSPACE_ATTACHMENTS_DIR}/image.png`]);
	});

	it("throws when a file write is refused", async () => {
		const { deps } = makeDeps({ failWrites: true });

		await expect(
			uploadPastedFiles({
				deps,
				workspaceId: "ws-1",
				worktreePath: WORKTREE,
				files: [new File(["x"], "image.png", { type: "image/png" })],
			}),
		).rejects.toThrow("conflict");
	});

	it("refuses oversized files before reading any bytes", async () => {
		const { deps, createdDirs, writes } = makeDeps();
		fileReads = 0;
		const big = new File([new Uint8Array(1)], "video.mov", {
			type: "video/quicktime",
		});
		// A 2GB Blob in the test would be real memory; fake the size instead —
		// the check reads file.size only.
		Object.defineProperty(big, "size", { value: 2 * 1024 * 1024 * 1024 });

		await expect(
			uploadPastedFiles({
				deps,
				workspaceId: "ws-1",
				worktreePath: WORKTREE,
				files: [big],
			}),
		).rejects.toThrow(PasteUploadLimitError);
		// Failed fast: nothing read, no directory created, no bytes shipped.
		expect(fileReads).toBe(0);
		expect(createdDirs).toHaveLength(0);
		expect(writes).toHaveLength(0);
	});

	it("refuses batches over the total budget", async () => {
		const { deps, createdDirs, writes } = makeDeps();
		fileReads = 0;
		const files = Array.from({ length: 5 }, (_, i) => {
			const f = new File([new Uint8Array(1)], `part${i}.bin`, {
				type: "application/octet-stream",
			});
			Object.defineProperty(f, "size", { value: 45 * 1024 * 1024 });
			return f;
		});

		await expect(
			uploadPastedFiles({
				deps,
				workspaceId: "ws-1",
				worktreePath: WORKTREE,
				files,
			}),
		).rejects.toThrow(PasteUploadLimitError);
		expect(fileReads).toBe(0);
		expect(createdDirs).toHaveLength(0);
		expect(writes).toHaveLength(0);
	});

	it("sanitizes path-hostile clipboard names and falls back to attachment_N", async () => {
		const { deps } = makeDeps();

		const paths = await uploadPastedFiles({
			deps,
			workspaceId: "ws-1",
			worktreePath: WORKTREE,
			files: [
				new File(["x"], "../shot: 1/final.png", { type: "image/png" }),
				new File(["y"], "", { type: "image/png" }),
				new File(["z"], "", { type: "application/x-thing" }),
			],
		});

		expect(paths).toEqual([
			`${WORKSPACE_ATTACHMENTS_DIR}/.._shot__1_final.png`,
			`${WORKSPACE_ATTACHMENTS_DIR}/attachment_2.png`,
			`${WORKSPACE_ATTACHMENTS_DIR}/attachment_3`,
		]);
	});
});
