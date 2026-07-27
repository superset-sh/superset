import { describe, expect, test } from "bun:test";
import { DEMO_FACTORY_WORK_ITEMS } from "../data/demo-factory";
import {
	applyDemoTransition,
	belongsToFactoryBoard,
	getFactoryStage,
	getNextFactoryStage,
} from "./factory-utils";

describe("factory utils", () => {
	test("uses the latest valid stage", () => {
		const item = {
			...DEMO_FACTORY_WORK_ITEMS[0],
			stages: ["intake", "triage", "unknown"],
		};
		expect(getFactoryStage(item)).toBe("triage");
	});

	test("keeps work and review queues separate", () => {
		const review = DEMO_FACTORY_WORK_ITEMS.find(
			(item) => item.metadata.board === "review",
		);
		expect(review).toBeDefined();
		if (!review) return;
		expect(belongsToFactoryBoard(review, "review")).toBe(true);
		expect(belongsToFactoryBoard(review, "work")).toBe(false);
	});

	test("advances a demo item without mutating the source", () => {
		const planning = DEMO_FACTORY_WORK_ITEMS.find(
			(item) => getFactoryStage(item) === "planning",
		);
		expect(planning).toBeDefined();
		if (!planning) return;
		const transitioned = applyDemoTransition(planning, "execute");
		expect(getFactoryStage(transitioned)).toBe("execute");
		expect(transitioned.revision).toBe(planning.revision + 1);
		expect(getFactoryStage(planning)).toBe("planning");
		expect(getNextFactoryStage("planning")).toBe("execute");
	});
});
