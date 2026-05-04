export interface HoverFocusTimerOptions {
	delayMs: number;
	onFire: () => void;
	isSuppressed?: () => boolean;
}

export interface HoverFocusTimer {
	enter: () => void;
	leave: () => void;
	dispose: () => void;
}

export function createHoverFocusTimer(
	opts: HoverFocusTimerOptions,
): HoverFocusTimer {
	let timerId: ReturnType<typeof setTimeout> | null = null;

	const clear = () => {
		if (timerId !== null) {
			clearTimeout(timerId);
			timerId = null;
		}
	};

	return {
		enter() {
			clear();
			timerId = setTimeout(() => {
				timerId = null;
				if (opts.isSuppressed?.()) return;
				opts.onFire();
			}, opts.delayMs);
		},
		leave: clear,
		dispose: clear,
	};
}
