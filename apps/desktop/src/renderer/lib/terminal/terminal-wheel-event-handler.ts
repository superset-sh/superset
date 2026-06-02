import type { Terminal as XTerm } from "@xterm/xterm";

const PAGE_UP = "\x1b[5~";
const PAGE_DOWN = "\x1b[6~";
const MAX_TICKS_PER_EVENT = 6;
const FALLBACK_CELL_HEIGHT = 16;

interface RenderDimensionAccess {
	_core?: {
		_renderService?: {
			dimensions?: { css?: { cell?: { height?: number } } };
		};
	};
}

function resolveCellHeight(terminal: XTerm): number {
	const cell = (terminal as unknown as RenderDimensionAccess)._core
		?._renderService?.dimensions?.css?.cell?.height;
	return cell && cell > 0 ? cell : FALLBACK_CELL_HEIGHT;
}

function wheelTicks(event: WheelEvent, cellHeight: number): number {
	const distance = Math.abs(event.deltaY);
	if (distance === 0) return 0;
	const raw =
		event.deltaMode === 1
			? Math.round(distance)
			: Math.max(1, Math.round(distance / cellHeight));
	return Math.min(raw, MAX_TICKS_PER_EVENT);
}

// The alternate screen buffer has no scrollback, so translate the wheel into
// PageUp/PageDown for the TUI and let xterm keep native scrollback otherwise.
export function createTerminalWheelEventHandler(terminal: XTerm) {
	return (event: WheelEvent): boolean => {
		if (terminal.buffer.active.type !== "alternate") return true;

		const ticks = wheelTicks(event, resolveCellHeight(terminal));
		if (ticks === 0) return false;

		const sequence = event.deltaY < 0 ? PAGE_UP : PAGE_DOWN;
		for (let i = 0; i < ticks; i++) {
			terminal.input(sequence, true);
		}
		return false;
	};
}

export function installTerminalWheelEventHandler(terminal: XTerm): () => void {
	terminal.attachCustomWheelEventHandler(
		createTerminalWheelEventHandler(terminal),
	);

	return () => {
		terminal.attachCustomWheelEventHandler(() => true);
	};
}
