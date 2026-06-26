import { describe, expect, mock, test } from "bun:test";
import { handleEnterKeyDown } from "./handleEnterKeyDown";

/**
 * Reproduction test for issue #4202: "Shift-enter not working".
 *
 * In the desktop chat input (TiptapPromptEditor) the original code registered
 * an `Enter` keymap binding that called `form.requestSubmit()` without
 * checking `event.shiftKey`, relying entirely on prosemirror-keymap's
 * modifier matching to dispatch `Shift-Enter` to a separate binding. The fix
 * moves Enter handling into `editorProps.handleKeyDown` and gates the submit
 * path on an explicit `isEnterSubmit(event)` check (which inspects
 * `event.shiftKey`). Shift+Enter falls through to HardBreak's default keymap,
 * which inserts a newline.
 */

interface MakeDepsOverrides {
	form?: HTMLFormElement | null;
	submitDisabled?: boolean;
	isComposing?: boolean;
	isSlashOpen?: boolean;
	isMentionOpen?: boolean;
}

function makeForm(submitDisabled = false): {
	form: HTMLFormElement;
	requestSubmit: ReturnType<typeof mock>;
} {
	const requestSubmit = mock(() => {});
	const submitButton = { disabled: submitDisabled, type: "submit" };
	const form = {
		querySelector: (sel: string) =>
			sel === 'button[type="submit"]' ? submitButton : null,
		requestSubmit,
	} as unknown as HTMLFormElement;
	return { form, requestSubmit };
}

function makeDeps(overrides: MakeDepsOverrides = {}) {
	const form = overrides.form === undefined ? makeForm().form : overrides.form;
	const editorDom = {
		closest: (sel: string) => (sel === "form" ? form : null),
	} as unknown as Element;
	return {
		getEditorDom: () => editorDom,
		isComposing: () => overrides.isComposing ?? false,
		isSlashOpen: () => overrides.isSlashOpen ?? false,
		isMentionOpen: () => overrides.isMentionOpen ?? false,
	};
}

function makeEvent(opts: {
	key: string;
	shiftKey?: boolean;
	isComposing?: boolean;
	keyCode?: number;
}): KeyboardEvent {
	const preventDefault = mock(() => {});
	return {
		key: opts.key,
		shiftKey: opts.shiftKey ?? false,
		isComposing: opts.isComposing ?? false,
		keyCode: opts.keyCode ?? 0,
		preventDefault,
	} as unknown as KeyboardEvent;
}

describe("handleEnterKeyDown — issue #4202 reproduction", () => {
	test("Shift+Enter is NOT consumed and does NOT submit the form", () => {
		// Falling through to HardBreak's keymap is what inserts the newline.
		const { form, requestSubmit } = makeForm();
		const deps = makeDeps({ form });

		const handled = handleEnterKeyDown(
			makeEvent({ key: "Enter", shiftKey: true }),
			deps,
		);

		expect(handled).toBe(false);
		expect(requestSubmit).not.toHaveBeenCalled();
	});

	test("Enter without Shift submits the form", () => {
		const { form, requestSubmit } = makeForm();
		const deps = makeDeps({ form });

		const handled = handleEnterKeyDown(makeEvent({ key: "Enter" }), deps);

		expect(handled).toBe(true);
		expect(requestSubmit).toHaveBeenCalledTimes(1);
	});

	test("Enter while composing (IME via deps) is not intercepted", () => {
		const { form, requestSubmit } = makeForm();
		const deps = makeDeps({ form, isComposing: true });

		const handled = handleEnterKeyDown(makeEvent({ key: "Enter" }), deps);

		expect(handled).toBe(false);
		expect(requestSubmit).not.toHaveBeenCalled();
	});

	test("Enter while composing (IME via event.isComposing) is not intercepted", () => {
		const { form, requestSubmit } = makeForm();
		const deps = makeDeps({ form });

		const handled = handleEnterKeyDown(
			makeEvent({ key: "Enter", isComposing: true }),
			deps,
		);

		expect(handled).toBe(false);
		expect(requestSubmit).not.toHaveBeenCalled();
	});

	test("Enter is not intercepted while a slash menu is open", () => {
		const { form, requestSubmit } = makeForm();
		const deps = makeDeps({ form, isSlashOpen: true });

		const handled = handleEnterKeyDown(makeEvent({ key: "Enter" }), deps);

		expect(handled).toBe(false);
		expect(requestSubmit).not.toHaveBeenCalled();
	});

	test("Enter is not intercepted while a mention menu is open", () => {
		const { form, requestSubmit } = makeForm();
		const deps = makeDeps({ form, isMentionOpen: true });

		const handled = handleEnterKeyDown(makeEvent({ key: "Enter" }), deps);

		expect(handled).toBe(false);
		expect(requestSubmit).not.toHaveBeenCalled();
	});

	test("Enter consumes the key but does not submit when the submit button is disabled", () => {
		const { form, requestSubmit } = makeForm(true);
		const deps = makeDeps({ form });

		const handled = handleEnterKeyDown(makeEvent({ key: "Enter" }), deps);

		expect(handled).toBe(true);
		expect(requestSubmit).not.toHaveBeenCalled();
	});

	test("Non-Enter keys are ignored", () => {
		const { form, requestSubmit } = makeForm();
		const deps = makeDeps({ form });

		const handled = handleEnterKeyDown(makeEvent({ key: "a" }), deps);

		expect(handled).toBe(false);
		expect(requestSubmit).not.toHaveBeenCalled();
	});
});
