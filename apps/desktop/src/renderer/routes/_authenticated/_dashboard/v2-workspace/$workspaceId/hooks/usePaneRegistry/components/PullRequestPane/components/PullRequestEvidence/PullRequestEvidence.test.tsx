import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@superset/i18n";
import {
	cleanup,
	fireEvent,
	render as renderComponent,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { PullRequestEvidence } from "./PullRequestEvidence";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

function render(element: ReactNode) {
	return renderComponent(element, {
		wrapper: ({ children }) => (
			<I18nProvider i18n={i18n}>{children}</I18nProvider>
		),
	});
}

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const pages = ["Test Results", "Screenshots", "CDP Video"].map(
	(title, index) => ({
		id: `page-${index}`,
		slug: `page-${index}`,
		title,
		thumbnailUrl: index === 0 ? "https://example.test/thumbnail.png" : null,
	}),
);
const defaults = {
	pages,
	totalCount: 5,
	hasMore: true,
	isPending: false,
	isError: false,
	onRetry: () => {},
	onOpenPage: () => {},
	onViewAll: () => {},
};

describe("PR evidence", () => {
	test("opens the selected page and offers the remaining pages through view all", () => {
		const onOpenPage = mock(() => {});
		const onViewAll = mock(() => {});
		const view = render(
			<PullRequestEvidence
				{...defaults}
				onOpenPage={onOpenPage}
				onViewAll={onViewAll}
			/>,
		);
		fireEvent.click(view.getByRole("button", { name: "Screenshots" }));
		expect(onOpenPage).toHaveBeenCalledWith(pages[1]);
		fireEvent.click(view.getByRole("button", { name: "View all (+2 more)" }));
		expect(onViewAll).toHaveBeenCalledTimes(1);
		expect(view.getByRole("heading").textContent).toBe("Pages5");
	});

	test("keeps a page usable when its thumbnail fails", () => {
		const onOpenPage = mock(() => {});
		const view = render(
			<PullRequestEvidence {...defaults} onOpenPage={onOpenPage} />,
		);
		const image = view.container.querySelector("img");
		expect(image).not.toBeNull();
		if (image) fireEvent.error(image);
		expect(view.container.querySelector("img")).toBeNull();
		fireEvent.click(view.getByRole("button", { name: "Test Results" }));
		expect(onOpenPage).toHaveBeenCalledWith(pages[0]);
	});

	test("distinguishes loading, failure with retry, and a successfully empty workspace", () => {
		const onRetry = mock(() => {});
		const view = render(
			<PullRequestEvidence
				{...defaults}
				pages={[]}
				totalCount={undefined}
				hasMore={false}
				isPending
			/>,
		);
		expect(view.getByRole("status")).toBeTruthy();
		expect(view.queryByText("No pages yet")).toBeNull();
		view.rerender(
			<PullRequestEvidence
				{...defaults}
				pages={[]}
				hasMore={false}
				totalCount={undefined}
				isError
				onRetry={onRetry}
			/>,
		);
		expect(view.getByRole("alert").textContent).toContain(
			"Pages could not be loaded",
		);
		expect(view.queryByText("No pages yet")).toBeNull();
		fireEvent.click(view.getByRole("button", { name: "Retry" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
		view.rerender(
			<PullRequestEvidence
				{...defaults}
				pages={[]}
				totalCount={0}
				hasMore={false}
			/>,
		);
		expect(view.getByText("No pages yet")).toBeTruthy();
		expect(view.queryByRole("button", { name: /^View all \(/ })).toBeNull();
	});
});
