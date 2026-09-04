import { describe, expect, test } from "bun:test";
import { customAppInputSchema, customAppSchema } from "./zod";

describe("custom app schemas", () => {
	test("input schema accepts a payload without an id", () => {
		expect(
			customAppInputSchema.safeParse({
				label: "Xcode Beta",
				bundleId: "com.apple.dt.Xcode",
			}).success,
		).toBe(true);
	});

	test("both schemas require an app name or a bundle id", () => {
		expect(customAppInputSchema.safeParse({ label: "Empty" }).success).toBe(
			false,
		);
		expect(
			customAppSchema.safeParse({ id: "custom:abc", label: "Empty" }).success,
		).toBe(false);
	});

	test("stored schema requires a custom: id", () => {
		expect(
			customAppSchema.safeParse({
				id: "cursor",
				label: "Cursor",
				appName: "Cursor",
			}).success,
		).toBe(false);
	});
});
