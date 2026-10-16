import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { TurnStatusRow } from "./TurnStatusRow";

afterEach(cleanup);

test("a failure is a card with the agent's words under what kind it was", () => {
	const view = render(
		<TurnStatusRow
			message="The model provider reported an error."
			status="failed"
		/>,
	);
	const card = view.container.querySelector("[data-turn-failed]");
	expect(card?.textContent).toBe(
		"Turn failedThe model provider reported an error.",
	);
	expect(card?.querySelector("svg")).not.toBeNull();
});

test("a refusal for usage is named as such", () => {
	const view = render(
		<TurnStatusRow
			message="You've hit your usage limit. Resets in a bit."
			status="failed"
		/>,
	);
	expect(view.container.textContent).toContain("Stopped by the usage limit");
});

test("an interruption is one quiet word", () => {
	const view = render(
		<TurnStatusRow message={undefined} status="interrupted" />,
	);
	expect(view.container.textContent).toBe("Interrupted");
	expect(view.container.querySelector("[data-turn-failed]")).toBeNull();
});
