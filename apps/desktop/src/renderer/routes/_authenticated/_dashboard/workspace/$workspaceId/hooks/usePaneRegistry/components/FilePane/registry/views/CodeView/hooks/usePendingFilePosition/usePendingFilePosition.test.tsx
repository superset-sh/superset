import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { usePendingFilePosition } from "./usePendingFilePosition";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, renderHook } = await import("@testing-library/react");
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function options() {
	return {
		editorRef: {
			current: {
				revealPosition: mock((_line: number, _column?: number) => {}),
			},
		},
		isReady: false,
		isActive: true,
		pendingPosition: { line: 240, column: 7 } as
			| { line: number; column?: number }
			| undefined,
		onPositionRevealed: mock(() => {}),
	};
}

describe("pending file position", () => {
	it("does not steal focus when a file finishes loading in an inactive pane", () => {
		const props = options();
		const { rerender } = renderHook(usePendingFilePosition, {
			initialProps: props,
		});
		rerender({ ...props, isActive: false });
		rerender({ ...props, isReady: true, isActive: false });
		expect(props.editorRef.current.revealPosition).not.toHaveBeenCalled();
		expect(props.onPositionRevealed).not.toHaveBeenCalled();
		rerender({ ...props, isReady: true, isActive: true });
		expect(props.editorRef.current.revealPosition).toHaveBeenCalledWith(240, 7);
		expect(props.onPositionRevealed).toHaveBeenCalledTimes(1);
	});
	it("applies only the latest request when loading completes", () => {
		const props = options();
		const { rerender } = renderHook(usePendingFilePosition, {
			initialProps: props,
		});
		const latest = { ...props, pendingPosition: { line: 400, column: 3 } };
		rerender(latest);
		expect(props.editorRef.current.revealPosition).not.toHaveBeenCalled();
		rerender({ ...latest, isReady: true });
		expect(props.editorRef.current.revealPosition).toHaveBeenCalledTimes(1);
		expect(props.editorRef.current.revealPosition).toHaveBeenCalledWith(400, 3);
	});
	it("does not replay consumed requests when switching panes", () => {
		const props = { ...options(), isReady: true };
		const { rerender } = renderHook(usePendingFilePosition, {
			initialProps: props,
		});
		rerender({ ...props, pendingPosition: undefined, isActive: false });
		rerender({ ...props, pendingPosition: undefined, isActive: true });
		expect(props.editorRef.current.revealPosition).toHaveBeenCalledTimes(1);
	});
	it("repeats a jump when the same location is requested again", () => {
		const props = { ...options(), isReady: true };
		const { rerender } = renderHook(usePendingFilePosition, {
			initialProps: props,
		});
		rerender({ ...props, pendingPosition: undefined });
		rerender({ ...props, pendingPosition: { line: 240, column: 7 } });
		expect(props.editorRef.current.revealPosition).toHaveBeenCalledTimes(2);
	});
});
