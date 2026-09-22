import { describe, expect, test } from "bun:test";
import { pinClassName } from "./pinClassName";

describe("pinClassName", () => {
	test("marks an open delete request red instead of blue", () => {
		const pin = pinClassName({
			resolved: false,
			active: false,
			intent: "delete",
		});
		expect(pin).toContain("bg-red-600");
		expect(pin).not.toContain("bg-blue-600");
	});

	test("leaves every other intent on the default blue", () => {
		expect(
			pinClassName({ resolved: false, active: false, intent: "approve" }),
		).toContain("bg-blue-600");
		expect(pinClassName({ resolved: false, active: false })).toContain(
			"bg-blue-600",
		);
	});

	test("drops the red once the delete request is resolved", () => {
		const pin = pinClassName({
			resolved: true,
			active: false,
			intent: "delete",
		});
		expect(pin).toContain("bg-neutral-500");
		expect(pin).not.toContain("bg-red-600");
	});

	test("deepens to red rather than blue when an open delete pin is active", () => {
		expect(
			pinClassName({ resolved: false, active: true, intent: "delete" }),
		).toContain("bg-red-800");
	});
});
