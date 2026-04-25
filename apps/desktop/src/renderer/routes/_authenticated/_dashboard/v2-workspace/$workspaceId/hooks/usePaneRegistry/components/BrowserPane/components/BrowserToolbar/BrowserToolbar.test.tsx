import { describe, expect, mock, test } from "bun:test";
import React, { type ReactElement } from "react";

mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		browserHistory: {
			getAll: { query: () => Promise.resolve([]) },
		},
	},
}));

const SHARED_INTERNALS = (React as unknown as Record<string, { H: unknown }>)
	.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

function buildDispatcher({ isEditing }: { isEditing: boolean }) {
	let useStateCallCount = 0;
	return {
		useState: (init: unknown) => {
			useStateCallCount += 1;
			if (useStateCallCount === 1) return [isEditing, () => {}];
			return [
				typeof init === "function" ? (init as () => unknown)() : init,
				() => {},
			];
		},
		useCallback: <T,>(cb: T) => cb,
		useEffect: () => {},
		useLayoutEffect: () => {},
		useRef: <T,>(init: T) => ({ current: init }),
		useMemo: <T,>(fn: () => T) => fn(),
		useContext: () => undefined,
		useDebugValue: () => {},
		useId: () => "test-id",
		useSyncExternalStore: <T,>(_: unknown, snapshot: () => T) => snapshot(),
	};
}

function installHookMocks(opts: { isEditing: boolean }) {
	SHARED_INTERNALS.H = buildDispatcher(opts);
}

function restoreHooks() {
	SHARED_INTERNALS.H = null;
}

interface WalkMatch {
	predicate: (el: ReactElement) => boolean;
	hit: ReactElement | null;
}

function walk(node: unknown, matches: WalkMatch[]): void {
	if (!node) return;
	if (Array.isArray(node)) {
		for (const n of node) walk(n, matches);
		return;
	}
	if (typeof node !== "object") return;
	const el = node as ReactElement;
	if (el.type !== undefined) {
		for (const m of matches) {
			if (!m.hit && m.predicate(el)) m.hit = el;
		}
	}
	const children = (el.props as { children?: unknown } | undefined)?.children;
	if (children !== undefined) walk(children, matches);
}

const { BrowserToolbar } = await import("./BrowserToolbar");

const baseProps = {
	currentUrl: "https://example.com",
	pageTitle: "Example",
	isLoading: false,
	canGoBack: false,
	canGoForward: false,
	onGoBack: () => {},
	onGoForward: () => {},
	onReload: () => {},
	onNavigate: () => {},
};

function renderToolbar({ isEditing }: { isEditing: boolean }): ReactElement {
	installHookMocks({ isEditing });
	try {
		return (BrowserToolbar as unknown as (p: typeof baseProps) => ReactElement)(
			baseProps,
		);
	} finally {
		restoreHooks();
	}
}

function isUrlBarContainer(el: ReactElement): boolean {
	const props = el.props as { className?: string };
	return (
		el.type === "div" &&
		typeof props.className === "string" &&
		props.className.includes("relative") &&
		props.className.includes("flex-1") &&
		props.className.includes("min-w-0") &&
		props.className.includes("items-center")
	);
}

describe("BrowserToolbar — mouse event propagation from URL bar", () => {
	test("URL bar container stops wheel propagation (edit mode)", () => {
		const tree = renderToolbar({ isEditing: true });
		const matches: WalkMatch[] = [{ predicate: isUrlBarContainer, hit: null }];
		walk(tree, matches);
		const urlBar = matches[0].hit;
		expect(urlBar).not.toBeNull();
		const props = urlBar?.props as { onWheel?: (e: unknown) => void };
		expect(typeof props.onWheel).toBe("function");
		const stopPropagation = mock(() => {});
		props.onWheel?.({ stopPropagation });
		expect(stopPropagation).toHaveBeenCalledTimes(1);
	});

	test("URL bar container stops wheel propagation (display mode)", () => {
		const tree = renderToolbar({ isEditing: false });
		const matches: WalkMatch[] = [{ predicate: isUrlBarContainer, hit: null }];
		walk(tree, matches);
		const urlBar = matches[0].hit;
		expect(urlBar).not.toBeNull();
		const props = urlBar?.props as { onWheel?: (e: unknown) => void };
		expect(typeof props.onWheel).toBe("function");
		const stopPropagation = mock(() => {});
		props.onWheel?.({ stopPropagation });
		expect(stopPropagation).toHaveBeenCalledTimes(1);
	});

	test("URL bar container stops mousedown propagation to parent drag source", () => {
		const tree = renderToolbar({ isEditing: false });
		const matches: WalkMatch[] = [{ predicate: isUrlBarContainer, hit: null }];
		walk(tree, matches);
		const urlBar = matches[0].hit;
		expect(urlBar).not.toBeNull();
		const props = urlBar?.props as { onMouseDown?: (e: unknown) => void };
		expect(typeof props.onMouseDown).toBe("function");
		const stopPropagation = mock(() => {});
		props.onMouseDown?.({ stopPropagation });
		expect(stopPropagation).toHaveBeenCalledTimes(1);
	});
});
