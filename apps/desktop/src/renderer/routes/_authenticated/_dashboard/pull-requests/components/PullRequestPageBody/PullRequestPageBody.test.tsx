import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { PullRequestPageBody } from "./PullRequestPageBody";

afterEach(cleanup);

function renderBody(width: number) {
	const clientWidth = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		"clientWidth",
	);
	Object.defineProperty(HTMLElement.prototype, "clientWidth", {
		configurable: true,
		get: () => width,
	});
	try {
		return render(
			<PullRequestPageBody
				header={<h1>Header</h1>}
				info={(variant) => <div data-testid={`info-${variant}`} />}
				aside={<div data-testid="aside" />}
			>
				<p>Description</p>
			</PullRequestPageBody>,
		);
	} finally {
		if (clientWidth)
			Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidth);
	}
}

describe("PR summary body layout", () => {
	test("renders one info variant and the aside once in each layout", () => {
		const narrow = renderBody(600);
		expect(narrow.getAllByTestId("aside")).toHaveLength(1);
		expect(narrow.getByTestId("info-rows")).toBeTruthy();
		expect(narrow.queryByTestId("info-column")).toBeNull();
		expect(
			narrow
				.getByText("Description")
				.compareDocumentPosition(narrow.getByTestId("aside")) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		narrow.unmount();

		const wide = renderBody(1000);
		expect(wide.getAllByTestId("aside")).toHaveLength(1);
		expect(wide.getByTestId("info-column")).toBeTruthy();
		expect(wide.queryByTestId("info-rows")).toBeNull();
		expect(wide.getByTestId("aside").closest("aside")).not.toBeNull();
	});
});
