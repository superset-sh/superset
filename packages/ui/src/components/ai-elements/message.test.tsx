import { describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const streamdownCalls: Array<Record<string, unknown>> = [];

mock.module("@streamdown/mermaid", () => ({
	mermaid: {},
}));

mock.module("streamdown", () => ({
	Streamdown: (props: Record<string, unknown>) => {
		streamdownCalls.push(props);
		return <div>{props.children as ReactNode}</div>;
	},
}));

const { MessageResponse } = await import("./message");

describe("MessageResponse", () => {
	it("preserves assistant soft line breaks in markdown paragraphs", () => {
		streamdownCalls.length = 0;

		renderToStaticMarkup(<MessageResponse>{"foo\nbar"}</MessageResponse>);

		const call = streamdownCalls.at(-1);
		expect(call).toBeDefined();
		expect(call?.className).toContain("[&_p]:whitespace-pre-wrap");
		expect(call?.className).toContain("[&_li]:whitespace-pre-wrap");
	});

	// Reproduction for https://github.com/superset-sh/superset/issues/4876
	//
	// Symptom: rendered AI/markdown text appears smeared / multi-ghosted
	// (clearly visible against custom themes whose foreground/background pair
	// has high contrast).
	//
	// Root cause hypothesis: any caller that renders <MessageResponse> WITHOUT
	// an explicit `animated={false}` silently opts in to a character-level
	// blur-in animation (180ms per char). When text streams in a few chars at
	// a time, overlapping blur-in animations stack across many adjacent chars
	// at once, producing the smeared/ghosted visual in the screenshot.
	it("defaults to a per-character blur-in animation when `animated` is not provided", () => {
		streamdownCalls.length = 0;

		renderToStaticMarkup(<MessageResponse>{"hello"}</MessageResponse>);

		const call = streamdownCalls.at(-1);
		expect(call).toBeDefined();
		// This assertion FAILS once the default is changed to `false` (or any
		// non-blurring animation). It documents the dangerous current default.
		expect(call?.animated).toEqual({
			animation: "blurIn",
			sep: "char",
			duration: 180,
			easing: "cubic-bezier(0.22, 1, 0.36, 1)",
		});
	});

	it("respects an explicit animated={false} (caller can opt out)", () => {
		streamdownCalls.length = 0;

		renderToStaticMarkup(
			<MessageResponse animated={false}>{"hello"}</MessageResponse>,
		);

		const call = streamdownCalls.at(-1);
		expect(call?.animated).toBe(false);
	});
});
