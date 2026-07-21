import { describe, expect, it } from "bun:test";
import { assertRequestedAgentsStarted } from "./agent-results";

const base = {
	workspace: { id: "workspace-1", name: "attachment-fix" },
	alreadyExists: false,
};

describe("assertRequestedAgentsStarted", () => {
	it("accepts successful launches and requests without agents", () => {
		expect(() =>
			assertRequestedAgentsStarted({ ...base, agents: [{ ok: true }] }, 1),
		).not.toThrow();
		expect(() =>
			assertRequestedAgentsStarted({ ...base, agents: [] }, 0),
		).not.toThrow();
	});

	it("reports partial failure with the retained workspace and retry command", () => {
		try {
			assertRequestedAgentsStarted(
				{
					...base,
					agents: [{ ok: false, error: "launcher exited with status 127" }],
				},
				1,
			);
			throw new Error("expected assertion to throw");
		} catch (error) {
			expect(error).toMatchObject({
				message:
					'Workspace "attachment-fix" was created, but the requested agent failed to start',
			});
			expect((error as { suggestion?: string }).suggestion).toContain(
				"launcher exited with status 127",
			);
			expect((error as { suggestion?: string }).suggestion).toContain(
				"superset agents create --workspace workspace-1",
			);
		}
	});

	it("rejects a missing host result instead of silently succeeding", () => {
		expect(() =>
			assertRequestedAgentsStarted({ ...base, agents: [] }, 1),
		).toThrow("failed to start");
	});
});
