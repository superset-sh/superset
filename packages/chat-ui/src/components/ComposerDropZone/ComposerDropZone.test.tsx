import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = await import("@testing-library/react");
const { useEffect } = await import("react");
const { markDropHandled } = await import("../../utils/handledDrops");
const { ComposerDropZone, useComposerDropZone } = await import(
	"./ComposerDropZone"
);

function Sink({ onFiles }: { onFiles: (files: FileList) => void }) {
	const zone = useComposerDropZone();
	useEffect(() => zone?.register(onFiles), [zone, onFiles]);
	return null;
}

function renderZone(onFiles: (files: FileList) => void) {
	return render(
		<ComposerDropZone label="Drop">
			<div data-testid="transcript" />
			<Sink onFiles={onFiles} />
		</ComposerDropZone>,
	);
}

function fileDrop(): DragEvent {
	const dataTransfer = new DataTransfer();
	dataTransfer.items.add(new File(["hello"], "notes.txt"));
	const drop = new DragEvent("drop", { bubbles: true, cancelable: true });
	Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
	return drop;
}

const preventEveryDrop = (event: Event) => event.preventDefault();

afterEach(() => {
	window.removeEventListener("drop", preventEveryDrop, true);
	cleanup();
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("ComposerDropZone", () => {
	test("attaches a drop that a window capture listener already prevented", () => {
		window.addEventListener("drop", preventEveryDrop, true);
		const onFiles = mock();
		const { getByTestId } = renderZone(onFiles);

		act(() => {
			getByTestId("transcript").dispatchEvent(fileDrop());
		});

		expect(onFiles).toHaveBeenCalledTimes(1);
		expect(onFiles.mock.calls[0]?.[0][0].name).toBe("notes.txt");
	});

	test("skips a drop another handler already took", () => {
		const onFiles = mock();
		const { getByTestId } = renderZone(onFiles);
		const drop = fileDrop();
		markDropHandled(drop);

		act(() => {
			getByTestId("transcript").dispatchEvent(drop);
		});

		expect(onFiles).not.toHaveBeenCalled();
	});
});
