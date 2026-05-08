import { describe, expect, mock, test } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const navigateCalls: Array<{ to: string }> = [];
let lastSearchOnKeyDown:
	| ((event: {
			key: string;
			defaultPrevented: boolean;
			preventDefault: () => void;
	  }) => void)
	| null = null;

mock.module("@superset/ui/alert-dialog", () => {
	const passthrough = ({ children }: { children?: ReactNode }) => (
		<div>{children}</div>
	);
	return {
		AlertDialog: ({
			open,
			children,
		}: {
			open?: boolean;
			children?: ReactNode;
		}) => (open ? <div>{children}</div> : null),
		AlertDialogContent: passthrough,
		AlertDialogDescription: passthrough,
		AlertDialogFooter: passthrough,
		AlertDialogHeader: passthrough,
		AlertDialogTitle: passthrough,
	};
});

mock.module("@superset/ui/button", () => ({
	Button: ({ children, ...rest }: { children?: ReactNode }) => (
		<button type="button" {...rest}>
			{children}
		</button>
	),
}));

mock.module("@superset/ui/input", () => ({
	Input: (props: Record<string, unknown>) => {
		const { onChange, onKeyDown, ...rest } = props as {
			onChange?: unknown;
			onKeyDown?: typeof lastSearchOnKeyDown;
		} & Record<string, unknown>;
		if ((rest as { placeholder?: string }).placeholder === "Search") {
			lastSearchOnKeyDown = onKeyDown ?? null;
		}
		return <input {...rest} />;
	},
}));

mock.module("@superset/ui/kbd", () => ({
	Kbd: ({ children }: { children?: ReactNode }) => <kbd>{children}</kbd>,
	KbdGroup: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

mock.module("@superset/ui/label", () => ({
	Label: ({ children, ...rest }: { children?: ReactNode }) => (
		// biome-ignore lint/a11y/noLabelWithoutControl: test stub for the Label component
		<label {...rest}>{children}</label>
	),
}));

mock.module("@superset/ui/sonner", () => ({
	toast: { error: () => {}, warning: () => {} },
}));

mock.module("@superset/ui/switch", () => ({
	Switch: (props: Record<string, unknown>) => {
		const { onCheckedChange, ...rest } = props as {
			onCheckedChange?: unknown;
		} & Record<string, unknown>;
		return <input type="checkbox" {...rest} />;
	},
}));

mock.module("@superset/ui/utils", () => ({
	cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

mock.module("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
	useNavigate: () => (target: { to: string }) => {
		navigateCalls.push(target);
	},
}));

mock.module("react-icons/hi2", () => ({
	HiMagnifyingGlass: (props: Record<string, unknown>) => <svg {...props} />,
}));

mock.module("renderer/hotkeys", () => ({
	HOTKEYS: {
		SHOW_HOTKEYS: {
			category: "Help",
			label: "Show Keyboard Shortcuts",
			description: "Open this page",
		},
	},
	useFormatBinding: () => ({ text: "" }),
	useHotkeyDisplay: () => ({ keys: ["⌘", "/"] }),
	useHotkeyOverridesStore: (selector: (s: unknown) => unknown) =>
		selector({
			resetOverride: () => {},
			resetAll: () => {},
			setOverride: () => {},
		}),
	useKeyboardPreferencesStore: (selector: (s: unknown) => unknown) =>
		selector({
			adaptiveLayoutEnabled: true,
			setAdaptiveLayoutEnabled: () => {},
		}),
	useRecordHotkeys: () => {},
}));

mock.module("renderer/stores/settings-state", () => ({
	useSettingsOriginRoute: () => "/workspace",
}));

const pageModule = await import("./page");
const Component = (
	pageModule.Route as unknown as { component: () => ReactElement }
).component;

describe("KeyboardShortcutsPage", () => {
	test("auto-focuses the search input when the page renders", () => {
		const html = renderToStaticMarkup(<Component />);
		const searchMatch = html.match(/<input[^>]*placeholder="Search"[^>]*>/);
		expect(searchMatch).not.toBeNull();
		expect(searchMatch?.[0].toLowerCase()).toContain("autofocus");
	});

	test("Escape from the search input navigates back to the origin route", () => {
		navigateCalls.length = 0;
		lastSearchOnKeyDown = null;

		renderToStaticMarkup(<Component />);

		expect(lastSearchOnKeyDown).toBeTypeOf("function");

		let prevented = false;
		lastSearchOnKeyDown?.({
			key: "Escape",
			defaultPrevented: false,
			preventDefault: () => {
				prevented = true;
			},
		});

		expect(prevented).toBe(true);
		expect(navigateCalls).toEqual([{ to: "/workspace" }]);
	});

	test("non-Escape keys in the search input do not navigate", () => {
		navigateCalls.length = 0;
		lastSearchOnKeyDown = null;

		renderToStaticMarkup(<Component />);

		lastSearchOnKeyDown?.({
			key: "a",
			defaultPrevented: false,
			preventDefault: () => {},
		});

		expect(navigateCalls).toEqual([]);
	});
});
