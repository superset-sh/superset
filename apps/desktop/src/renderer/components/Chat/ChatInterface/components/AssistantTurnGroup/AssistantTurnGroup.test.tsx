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

	it("shows the Claude lead and a status-colored dot", () => {
		const complete = renderToStaticMarkup(
			<AssistantTurnGroup
				summary="1 tool call"
				status="complete"
				steps={<div />}
			/>,
		);
		expect(complete).toContain("Claude");
		expect(complete).toContain("bg-emerald-500");
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
