import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantTurnGroup } from "./AssistantTurnGroup";

describe("AssistantTurnGroup", () => {
	it("keeps the final answer visible even when collapsed", () => {
		const html = renderToStaticMarkup(
			<AssistantTurnGroup
				summary="3 tools · 1 message"
				status="complete"
				defaultOpen={false}
				steps={<div>STEP_CONTENT</div>}
				lastOutput={<div>FINAL_ANSWER</div>}
			/>,
		);
		// The answer lives outside the collapsible, so it is always present.
		expect(html).toContain("FINAL_ANSWER");
		expect(html).toContain("3 tools · 1 message");
	});

	it("shows the assistant lead plus a status dot and screen-reader label", () => {
		const complete = renderToStaticMarkup(
			<AssistantTurnGroup
				summary="1 tool call"
				status="complete"
				steps={<div />}
			/>,
		);
		expect(complete).toContain("Assistant");
		expect(complete).toContain("bg-emerald-500");
		expect(complete).toContain("Done"); // sr-only status text
		expect(
			renderToStaticMarkup(
				<AssistantTurnGroup
					summary="1 tool call"
					status="error"
					steps={<div />}
				/>,
			),
		).toContain("bg-red-500");
		expect(
			renderToStaticMarkup(
				<AssistantTurnGroup summary="" status="in_progress" steps={<div />} />,
			),
		).toContain("bg-sky-500");
	});

	it("signals a pending action with an amber dot + sr-only label", () => {
		const html = renderToStaticMarkup(
			<AssistantTurnGroup
				summary="1 tool call"
				status="complete"
				pendingAction
				steps={<div />}
			/>,
		);
		expect(html).toContain("bg-amber-500");
		expect(html).toContain("Awaiting approval");
		// The misleading "complete/green" state must not win while pending.
		expect(html).not.toContain("bg-emerald-500");
	});

	it("renders step content when opened by default", () => {
		const html = renderToStaticMarkup(
			<AssistantTurnGroup
				summary="2 tools"
				status="in_progress"
				defaultOpen
				steps={<div>OPEN_STEP_CONTENT</div>}
			/>,
		);
		expect(html).toContain("OPEN_STEP_CONTENT");
	});
});
