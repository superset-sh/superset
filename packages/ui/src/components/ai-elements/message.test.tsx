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
});
