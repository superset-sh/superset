import { describe, expect, it } from "bun:test";
import type { BackgroundTask } from "@superset/chat/protocol";
import { BackgroundTasks } from "./backgroundTasks";

const INTERVAL_MS = 5;

describe("BackgroundTasks", () => {
	it("publishes the list on start and only coalesced details for steps", async () => {
		const lists: BackgroundTask[][] = [];
		const details: string[] = [];
		const tasks = new BackgroundTasks(
			(list) => lists.push(list),
			(_id, detail) => details.push(detail),
			INTERVAL_MS,
		);
		tasks.start({
			id: "a",
			kind: "subagent",
			name: "Review",
			canStop: false,
			startedAtMs: 0,
		});
		tasks.update("a", { detail: "one" });
		tasks.update("a", { detail: "two" });

		await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 4));
		expect(lists).toHaveLength(1);
		expect(details).toEqual(["two"]);
		tasks.dispose();
	});
});
