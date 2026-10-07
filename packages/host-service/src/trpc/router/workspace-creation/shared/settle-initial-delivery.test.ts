import { expect, test } from "bun:test";
import type { HostDb } from "../../../../db";
import { settleInitialDelivery } from "./settle-initial-delivery";

test("failed initial delivery disposes the registered terminal once and preserves refusal", async () => {
	const disposed: string[] = [];
	await expect(
		settleInitialDelivery(
			{
				settled: Promise.resolve({
					kind: "SESSION_NOT_ACTIVE",
					error: "wrong target",
				}),
			},
			"terminal",
			{} as HostDb,
			async (id) => {
				disposed.push(id);
			},
		),
	).rejects.toMatchObject({
		code: "NOT_FOUND",
		cause: { deliveryRefused: true },
	});
	expect(disposed).toEqual(["terminal"]);
	await settleInitialDelivery(
		{ settled: Promise.resolve({ success: true }) },
		"successful",
		{} as HostDb,
		async (id) => {
			disposed.push(id);
		},
	);
	expect(disposed).toEqual(["terminal"]);
});
