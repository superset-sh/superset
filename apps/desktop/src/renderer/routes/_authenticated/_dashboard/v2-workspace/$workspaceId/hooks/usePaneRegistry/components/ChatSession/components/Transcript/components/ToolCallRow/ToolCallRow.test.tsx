import { afterEach, expect, test } from "bun:test";
import type { ToolCall } from "@superset/chat/protocol";
import { cleanup, render } from "@testing-library/react";
import { ToolCallRow } from "./ToolCallRow";

afterEach(cleanup);

const runningCommand: ToolCall = {
	id: "call-1",
	kind: "tool_call",
	title:
		'sleep 55 # a deliberately long single line command tail -n 0 /tmp/gone.txt; W="$SUPERSET_WORKSPACE_ID"; superset terminals read --local --workspace "$W"',
	toolKind: "execute",
	toolName: "bash",
	status: "running",
	content: [],
	startedAtMs: 0,
};

function labelSpan(container: HTMLElement) {
	const title = container.querySelector("[data-find-item] > span");
	expect(title).not.toBeNull();
	const label = [...(title?.children ?? [])].find((child) =>
		child.textContent?.includes("sleep 55"),
	);
	expect(label).not.toBeUndefined();
	return label as HTMLElement;
}

test("a running command title shrinks so it ellipsizes instead of overflowing", () => {
	const { container } = render(<ToolCallRow item={runningCommand} />);
	const labelClasses = labelSpan(container).className.split(/\s+/);
	expect(labelClasses).toContain("shrink");
	expect(labelClasses).not.toContain("shrink-0");
});
