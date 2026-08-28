import { describe, expect, it } from "bun:test";
import {
	type AttachmentConstraintError,
	applyAttachmentConstraints,
	matchesAccept,
} from "./attachment-constraints";

const file = (name: string, type: string, size = 10): File => {
	const f = new File(["x"], name, { type });
	Object.defineProperty(f, "size", { value: size });
	return f;
};

function run(
	files: File[],
	constraints: Parameters<typeof applyAttachmentConstraints>[0]["constraints"],
	currentCount = 0,
) {
	const errors: AttachmentConstraintError[] = [];
	const kept = applyAttachmentConstraints({
		files,
		currentCount,
		constraints,
		onError: (e) => errors.push(e),
	});
	return { names: kept.map((f) => f.name), codes: errors.map((e) => e.code) };
}

describe("matchesAccept", () => {
	it("passes everything when no accept is set", () => {
		expect(matchesAccept(file("a.bin", "application/octet-stream"))).toBe(true);
	});

	it("matches wildcard and exact patterns", () => {
		expect(matchesAccept(file("a.png", "image/png"), "image/*")).toBe(true);
		expect(matchesAccept(file("a.pdf", "application/pdf"), "image/*")).toBe(
			false,
		);
		expect(
			matchesAccept(
				file("a.pdf", "application/pdf"),
				"image/*,application/pdf",
			),
		).toBe(true);
	});
});

describe("applyAttachmentConstraints", () => {
	it("keeps every file when nothing is constrained", () => {
		const { names, codes } = run(
			[file("a.png", "image/png"), file("b.pdf", "application/pdf")],
			{},
		);
		expect(names).toEqual(["a.png", "b.pdf"]);
		expect(codes).toEqual([]);
	});

	it("caps a batch at the remaining capacity and reports it", () => {
		// The composer already holds 3 of its 5 slots, so only 2 of these land.
		const { names, codes } = run(
			[
				file("a.png", "image/png"),
				file("b.png", "image/png"),
				file("c.png", "image/png"),
			],
			{ maxFiles: 5 },
			3,
		);
		expect(names).toEqual(["a.png", "b.png"]);
		expect(codes).toEqual(["max_files"]);
	});

	it("adds nothing once the composer is full", () => {
		const { names, codes } = run(
			[file("a.png", "image/png")],
			{ maxFiles: 5 },
			5,
		);
		expect(names).toEqual([]);
		expect(codes).toEqual(["max_files"]);
	});

	it("drops oversized files, keeps the rest, and says so", () => {
		// A partial drop must not be silent: the user picked those files too.
		const { names, codes } = run(
			[file("small.png", "image/png", 100), file("big.png", "image/png", 999)],
			{ maxFileSize: 500 },
		);
		expect(names).toEqual(["small.png"]);
		expect(codes).toEqual(["max_file_size"]);
	});

	it("reports max_file_size only when the whole batch is too big", () => {
		const { names, codes } = run([file("big.png", "image/png", 999)], {
			maxFileSize: 500,
		});
		expect(names).toEqual([]);
		expect(codes).toEqual(["max_file_size"]);
	});

	it("reports accept whether the whole batch or only part of it is rejected", () => {
		expect(
			run([file("a.pdf", "application/pdf")], { accept: "image/*" }),
		).toEqual({ names: [], codes: ["accept"] });
		// Partial rejection is reported too, so a dropped file is never silent.
		expect(
			run([file("a.pdf", "application/pdf"), file("b.png", "image/png")], {
				accept: "image/*",
			}),
		).toEqual({ names: ["b.png"], codes: ["accept"] });
	});

	it("does not report accept for an empty batch", () => {
		expect(run([], { accept: "image/*" })).toEqual({ names: [], codes: [] });
	});
});
