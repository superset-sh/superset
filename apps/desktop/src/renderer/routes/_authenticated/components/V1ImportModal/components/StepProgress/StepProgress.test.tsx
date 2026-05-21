import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getStepProgress, StepProgress } from "./StepProgress";

describe("StepProgress", () => {
	it("converts a zero-based page index into user-facing progress", () => {
		expect(getStepProgress({ currentIndex: 2, totalSteps: 5 })).toEqual({
			currentStep: 3,
			totalSteps: 5,
			percent: 60,
			label: "Step 3 of 5",
		});
	});

	it("renders an accessible step progress bar", () => {
		const markup = renderToStaticMarkup(
			<StepProgress currentIndex={2} totalSteps={5} />,
		);

		expect(markup).toContain("Step 3 of 5");
		expect(markup).toContain('role="progressbar"');
		expect(markup).toContain('aria-label="Step 3 of 5"');
		expect(markup).toContain('aria-valuenow="3"');
		expect(markup).toContain('aria-valuemax="5"');
		expect(markup).toContain("-top-px");
		expect(markup).toContain("h-px");
	});
});
