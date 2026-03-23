import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Reproduction test for GitHub issue #2761:
 * Right-click context menu on bottom workspace auto-triggers "Open in Finder"
 *
 * Root cause: ContextMenuContent had no collisionPadding, so when the menu
 * opened near the viewport edge, Radix flipped it but the cursor ended up
 * directly over the first menu item, causing an immediate pointerup selection.
 *
 * Fix: Add collisionPadding to ContextMenuContent so the menu repositions
 * with enough clearance that no item lands under the cursor after a flip.
 */

// Track props passed to the Radix Content primitive
const capturedContentProps: Array<Record<string, unknown>> = [];

mock.module("@radix-ui/react-context-menu", () => {
	const React = require("react");
	return {
		Root: ({ children }: { children: React.ReactNode }) => (
			<div data-testid="context-menu-root">{children}</div>
		),
		Trigger: ({ children }: { children: React.ReactNode }) => (
			<div data-testid="context-menu-trigger">{children}</div>
		),
		Portal: ({ children }: { children: React.ReactNode }) => (
			<div data-testid="context-menu-portal">{children}</div>
		),
		Content: (props: Record<string, unknown>) => {
			capturedContentProps.push(props);
			return (
				<div data-testid="context-menu-content">
					{props.children as React.ReactNode}
				</div>
			);
		},
		Item: ({ children }: { children: React.ReactNode }) => (
			<div data-testid="context-menu-item">{children}</div>
		),
		CheckboxItem: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		RadioItem: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		ItemIndicator: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		Label: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		Separator: () => <hr />,
		Sub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
		SubTrigger: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		SubContent: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		Group: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		RadioGroup: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
	};
});

const { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } =
	await import("./context-menu");

describe("ContextMenuContent", () => {
	it("should include collisionPadding to prevent auto-selection near viewport edges (#2761)", () => {
		capturedContentProps.length = 0;

		renderToStaticMarkup(
			<ContextMenu>
				<ContextMenuTrigger>Right-click me</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem>Open in Finder</ContextMenuItem>
					<ContextMenuItem>Copy Path</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>,
		);

		expect(capturedContentProps.length).toBeGreaterThan(0);
		const contentProps = capturedContentProps[0];

		// collisionPadding must be set to prevent the menu from spawning
		// flush against the viewport edge, which causes immediate item selection
		expect(contentProps?.collisionPadding).toBeDefined();
		expect(contentProps?.collisionPadding).toBeGreaterThanOrEqual(8);
	});
});
