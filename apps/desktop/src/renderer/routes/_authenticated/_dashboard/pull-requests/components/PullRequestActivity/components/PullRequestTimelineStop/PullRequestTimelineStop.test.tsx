import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { PullRequestTimelineStop } from "./PullRequestTimelineStop";

afterEach(cleanup);

function Draft() {
	const [text, setText] = useState("");
	return (
		<input
			aria-label="draft"
			value={text}
			onChange={(event) => setText(event.target.value)}
		/>
	);
}

function stop(rail: boolean) {
	return (
		<ol>
			<PullRequestTimelineStop first last node={null} rail={rail}>
				<Draft />
			</PullRequestTimelineStop>
		</ol>
	);
}

describe("a timeline stop", () => {
	test("keeps its content mounted when the rail comes and goes", () => {
		const view = render(stop(true));
		fireEvent.change(view.getByLabelText("draft"), {
			target: { value: "half a reply" },
		});
		view.rerender(stop(false));
		expect(view.getByLabelText("draft")).toHaveProperty(
			"value",
			"half a reply",
		);
		view.rerender(stop(true));
		expect(view.getByLabelText("draft")).toHaveProperty(
			"value",
			"half a reply",
		);
	});
});
