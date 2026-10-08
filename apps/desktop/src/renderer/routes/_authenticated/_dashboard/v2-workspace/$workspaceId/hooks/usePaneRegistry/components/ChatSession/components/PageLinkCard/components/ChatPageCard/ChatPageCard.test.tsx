import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ChatPageCardPage } from "./ChatPageCard";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { ChatPageCard } = await import("./ChatPageCard");

afterEach(cleanup);
const THUMBNAIL = "https://frame.usercontent.test/thumbnail/page-1/3?t=ticket";

const page: ChatPageCardPage = {
	title: "Quarterly report",
	description: "Revenue, churn and pipeline",
	updatedAt: new Date(Date.now() - 3 * 60_000),
	thumbnailUrl: THUMBNAIL,
};

function renderCard(overrides: Partial<ChatPageCardPage> = {}) {
	const onOpen = mock(() => {});
	const view = render(
		<ChatPageCard onOpen={onOpen} page={{ ...page, ...overrides }} />,
	);
	return { onOpen, view, card: view.getByRole("button") };
}

describe("ChatPageCard", () => {
	test("shows the thumbnail beside the title, description and edited time", () => {
		const { card, onOpen, view } = renderCard();

		expect(card.querySelector("img")?.getAttribute("src")).toBe(THUMBNAIL);
		expect(card.querySelector("svg")).toBeNull();
		expect(view.getByText("Quarterly report")).toBeTruthy();
		expect(view.getByText("Revenue, churn and pipeline")).toBeTruthy();
		expect(card.textContent).toMatch(/Edited .*3/);

		fireEvent.click(card);
		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	test("heads the card with its title when no thumbnail was captured", () => {
		const { card, view } = renderCard({ thumbnailUrl: null });

		expect(card.querySelector("img")).toBeNull();
		expect(card.querySelector("svg")).toBeTruthy();
		expect(view.getByText("Quarterly report")).toBeTruthy();
		expect(view.getByText("Revenue, churn and pipeline")).toBeTruthy();
	});

	test("falls back to the header when the thumbnail fails, at the same height", () => {
		const { card, view } = renderCard();
		const heightBefore = card.className.match(/\bh-\[\d+px\]/)?.[0];
		const image = card.querySelector("img");
		if (!image) throw new Error("expected a thumbnail");

		fireEvent.error(image);

		expect(card.querySelector("img")).toBeNull();
		expect(card.querySelector("svg")).toBeTruthy();
		expect(view.getByText("Quarterly report")).toBeTruthy();
		expect(heightBefore).toBeTruthy();
		expect(card.className.match(/\bh-\[\d+px\]/)?.[0]).toBe(heightBefore);
	});

	test("tries a thumbnail again when the page gets a new one", () => {
		const { card, view } = renderCard();
		const image = card.querySelector("img");
		if (!image) throw new Error("expected a thumbnail");
		fireEvent.error(image);

		const fresh = `${THUMBNAIL}-renewed`;
		view.rerender(
			<ChatPageCard
				onOpen={() => {}}
				page={{ ...page, thumbnailUrl: fresh }}
			/>,
		);
		expect(card.querySelector("img")?.getAttribute("src")).toBe(fresh);
	});

	test("leaves out a description the page does not have", () => {
		const { card } = renderCard({ description: null });
		expect(card.textContent).not.toContain("Revenue");
		expect(card.textContent).toContain("Quarterly report");
	});
});
