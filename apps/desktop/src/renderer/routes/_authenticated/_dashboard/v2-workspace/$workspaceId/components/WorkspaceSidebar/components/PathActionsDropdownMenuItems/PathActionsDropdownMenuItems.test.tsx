import { describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Radix's Portal returns null during SSR (it gates on a layout-effect-driven
// `mounted` state plus `document.body`). Render its children inline so
// renderToStaticMarkup walks into the menu content tree.
mock.module("@radix-ui/react-portal", () => ({
	Portal: ({ children }: { children: React.ReactNode }) =>
		React.createElement(React.Fragment, null, children),
	Root: ({ children }: { children: React.ReactNode }) =>
		React.createElement(React.Fragment, null, children),
}));

// Static-render stubs — handlers aren't invoked during renderToStaticMarkup.
mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		external: { openInFinder: { mutate: async () => undefined } },
	},
}));
mock.module("renderer/hooks/useCopyToClipboard", () => ({
	useCopyToClipboard: () => ({ copyToClipboard: async () => undefined }),
}));

const { PathActionsDropdownMenuItems } = await import(
	"./PathActionsDropdownMenuItems"
);
const { PathActionsMenuItems } = await import("../PathActionsMenuItems");
const dm = await import("@superset/ui/dropdown-menu");
const cm = await import("@superset/ui/context-menu");

// Regression for #4636. Radix's `DropdownMenu` and `ContextMenu` set up
// distinct context scopes on top of the shared `@radix-ui/react-menu`
// primitives. A `ContextMenuItem` inside a `DropdownMenu` (or vice versa)
// fails the scoped Menu context lookup and throws
// "`MenuItem` must be used within `Menu`". The Pierre-driven changes tree's
// row context menu mounts a `DropdownMenu`, so its items must use the
// dropdown-scoped primitives.
describe("PathActionsDropdownMenuItems (#4636)", () => {
	test("renders without throwing inside a DropdownMenu", () => {
		const tree = (
			<dm.DropdownMenu open>
				<dm.DropdownMenuTrigger />
				<dm.DropdownMenuContent forceMount>
					<PathActionsDropdownMenuItems
						absolutePath="/tmp/a.txt"
						relativePath="a.txt"
					/>
				</dm.DropdownMenuContent>
			</dm.DropdownMenu>
		);
		expect(() => renderToStaticMarkup(tree)).not.toThrow();
	});

	test("the ContextMenu variant still works in its native scope", () => {
		const tree = (
			<cm.ContextMenu>
				<cm.ContextMenuTrigger />
				<cm.ContextMenuContent forceMount>
					<PathActionsMenuItems
						absolutePath="/tmp/a.txt"
						relativePath="a.txt"
					/>
				</cm.ContextMenuContent>
			</cm.ContextMenu>
		);
		expect(() => renderToStaticMarkup(tree)).not.toThrow();
	});

	test("documents the scope mismatch: ContextMenuItems inside a DropdownMenu throws", () => {
		const tree = (
			<dm.DropdownMenu open>
				<dm.DropdownMenuTrigger />
				<dm.DropdownMenuContent forceMount>
					<PathActionsMenuItems
						absolutePath="/tmp/a.txt"
						relativePath="a.txt"
					/>
				</dm.DropdownMenuContent>
			</dm.DropdownMenu>
		);
		expect(() => renderToStaticMarkup(tree)).toThrow(/must be used within/);
	});
});
