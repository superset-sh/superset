import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PendingQuestionMessage } from "./PendingQuestionMessage";
import { formatSelectedAnswer, toggleSelection } from "./selection";

// Minimal shape compatible with the component's PendingQuestion prop.
function makeQuestion(overrides: Record<string, unknown>) {
	return {
		questionId: "q1",
		question: "Which ones apply?",
		options: [{ label: "Apples" }, { label: "Bananas" }, { label: "Cherries" }],
		...overrides,
		// biome-ignore lint/suspicious/noExplicitAny: test fixture only needs structural compatibility
	} as any;
}

describe("PendingQuestionMessage multi-select (issue #5361)", () => {
	it("renders a submit control for a multi-select question so multiple options can be chosen before submitting", () => {
		const markup = renderToStaticMarkup(
			<PendingQuestionMessage
				question={makeQuestion({ multiSelect: true })}
				isSubmitting={false}
				onRespond={async () => {}}
			/>,
		);

		// Bug repro: a multi-select question must expose an explicit submit
		// affordance. Without it, clicking a single option immediately submits
		// and the user can never pick more than one.
		expect(markup).toContain("Submit selection");
		// Options must still be visible alongside the submit control.
		expect(markup).toContain("Apples");
		expect(markup).toContain("Bananas");
	});

	it("does not render a submit-selection control for a single-select question (auto-submit on click preserved)", () => {
		const markup = renderToStaticMarkup(
			<PendingQuestionMessage
				question={makeQuestion({ multiSelect: false })}
				isSubmitting={false}
				onRespond={async () => {}}
			/>,
		);

		expect(markup).not.toContain("Submit selection");
		expect(markup).toContain("Apples");
	});
});

describe("multi-select selection helpers", () => {
	it("accumulates selections instead of replacing them", () => {
		let selected: string[] = [];
		selected = toggleSelection(selected, "Apples");
		selected = toggleSelection(selected, "Bananas");
		expect(selected).toEqual(["Apples", "Bananas"]);
	});

	it("toggles an already-selected option off", () => {
		const selected = toggleSelection(["Apples", "Bananas"], "Apples");
		expect(selected).toEqual(["Bananas"]);
	});

	it("formats multiple selections as a comma-separated answer", () => {
		expect(formatSelectedAnswer(["Apples", "Bananas"])).toBe("Apples, Bananas");
	});

	it("formats a single selection without a trailing separator", () => {
		expect(formatSelectedAnswer(["Apples"])).toBe("Apples");
	});
});
