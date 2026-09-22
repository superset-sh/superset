import { describe, expect, test } from "bun:test";
import { dashboardSidebarSectionSchema } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { getNewGroupTabOrder } from "./getNewGroupTabOrder";

describe("getNewGroupTabOrder", () => {
	test("replaces the source workspace slot without moving later siblings", () => {
		expect(getNewGroupTabOrder([{ tabOrder: 2, isGrouped: false }], 9)).toBe(2);
	});
	test("uses the first visual position regardless of selection order", () => {
		expect(
			getNewGroupTabOrder(
				[
					{ tabOrder: 8, isGrouped: false },
					{ tabOrder: 2, isGrouped: false },
				],
				9,
			),
		).toBe(2);
	});
	test("places a former group member in the slot after that group", () => {
		expect(getNewGroupTabOrder([{ tabOrder: 2, isGrouped: true }], 9)).toBe(3);
	});
	test("places a member of the last group immediately after it", () => {
		expect(getNewGroupTabOrder([{ tabOrder: 8, isGrouped: true }], 9)).toBe(9);
	});
	test("keeps standalone group creation at the supplied default", () => {
		expect(getNewGroupTabOrder([], 9)).toBe(9);
	});
	test("returns an order the section row accepts", () => {
		const tabOrder = getNewGroupTabOrder([{ tabOrder: 2, isGrouped: true }], 9);
		expect(
			dashboardSidebarSectionSchema.parse({
				sectionId: "11111111-1111-4111-8111-111111111111:group-2",
				projectId: "11111111-1111-4111-8111-111111111111",
				name: "New group",
				createdAt: new Date(),
				tabOrder,
				isCollapsed: false,
				color: null,
				tag: "group-2",
			}).tabOrder,
		).toBe(tabOrder);
	});
});
