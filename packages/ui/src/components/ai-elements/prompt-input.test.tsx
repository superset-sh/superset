import { describe, expect, it } from "bun:test";

const { getFilesFromDataTransferItems } = await import("./prompt-input");

/**
 * Build a mock that mirrors a real browser `DataTransferItemList`: array-like
 * (indexed + `length`) but deliberately WITHOUT `Symbol.iterator`, because the
 * real interface is not iterable. This is what reaches `onPaste` when a user
 * pastes a clipboard image (e.g. a screenshot) into the new-workspace prompt.
 */
function makeClipboardItems(
	files: File[],
	extraTextItem = true,
): DataTransferItemList {
	const items: DataTransferItem[] = [];

	if (extraTextItem) {
		// Pasting an image often also carries a text/plain representation.
		items.push({
			kind: "string",
			type: "text/plain",
			getAsFile: () => null,
		} as unknown as DataTransferItem);
	}

	for (const file of files) {
		items.push({
			kind: "file",
			type: file.type,
			getAsFile: () => file,
		} as unknown as DataTransferItem);
	}

	const list: Record<string, unknown> = { length: items.length };
	items.forEach((item, index) => {
		list[index] = item;
	});

	// Intentionally do NOT attach Symbol.iterator — matches the real DOM type.
	return list as unknown as DataTransferItemList;
}

describe("getFilesFromDataTransferItems", () => {
	it("extracts pasted image files from a non-iterable DataTransferItemList", () => {
		const image = new File(["fake-png-bytes"], "screenshot.png", {
			type: "image/png",
		});
		const items = makeClipboardItems([image]);

		const files = getFilesFromDataTransferItems(items);

		expect(files).toHaveLength(1);
		expect(files[0]?.name).toBe("screenshot.png");
		expect(files[0]?.type).toBe("image/png");
	});

	it("ignores non-file clipboard items", () => {
		const items = makeClipboardItems([], true);
		expect(getFilesFromDataTransferItems(items)).toHaveLength(0);
	});
});
