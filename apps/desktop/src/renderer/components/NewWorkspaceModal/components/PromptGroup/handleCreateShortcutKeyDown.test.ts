import { describe, expect, mock, test } from "bun:test";
import { handleCreateShortcutKeyDown } from "./handleCreateShortcutKeyDown";

function createKeyboardEvent(
	overrides: Partial<{
		key: string;
		metaKey: boolean;
		ctrlKey: boolean;
	}> = {},
) {
	return {
		key: "Enter",
		metaKey: false,
		ctrlKey: false,
		preventDefault: mock(() => {}),
		...overrides,
	};
}

describe("handleCreateShortcutKeyDown", () => {
	test("submits when Cmd+Enter is pressed", () => {
		const event = createKeyboardEvent({ metaKey: true });
		const onCreate = mock(() => {});

		handleCreateShortcutKeyDown(event, onCreate);

		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		expect(onCreate).toHaveBeenCalledTimes(1);
	});

	test("submits when Ctrl+Enter is pressed", () => {
		const event = createKeyboardEvent({ ctrlKey: true });
		const onCreate = mock(() => {});

		handleCreateShortcutKeyDown(event, onCreate);

		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		expect(onCreate).toHaveBeenCalledTimes(1);
	});

	test("does not submit on plain Enter", () => {
		const event = createKeyboardEvent();
		const onCreate = mock(() => {});

		handleCreateShortcutKeyDown(event, onCreate);

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(onCreate).not.toHaveBeenCalled();
	});
});
