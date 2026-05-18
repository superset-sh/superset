import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";

interface RenderStressOptions {
	windowMs?: number;
	warnAt?: number;
	getDetails?: () => Record<string, unknown>;
}

const DEFAULT_WINDOW_MS = 5_000;
const DEFAULT_WARN_AT = 40;

export function useRenderStressInstrumentation(
	name: string,
	options: RenderStressOptions = {},
): void {
	const stateRef = useRef({ count: 0, windowStartedAt: 0, warned: false });

	useEffect(() => {
		if (env.NODE_ENV !== "development") return;

		const now = performance.now();
		const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
		const warnAt = options.warnAt ?? DEFAULT_WARN_AT;
		const state = stateRef.current;

		if (state.windowStartedAt === 0 || now - state.windowStartedAt > windowMs) {
			state.count = 0;
			state.windowStartedAt = now;
			state.warned = false;
		}

		state.count += 1;

		if (!state.warned && state.count >= warnAt) {
			state.warned = true;
			console.warn(
				"[stress] high renderer commit rate",
				JSON.stringify({
					name,
					count: state.count,
					windowMs,
					...(options.getDetails?.() ?? {}),
				}),
			);
		}
	});
}

export function logStressEvent(
	name: string,
	details?: Record<string, unknown>,
): void {
	if (env.NODE_ENV !== "development") return;
	console.debug("[stress]", name, JSON.stringify(details ?? {}));
}
