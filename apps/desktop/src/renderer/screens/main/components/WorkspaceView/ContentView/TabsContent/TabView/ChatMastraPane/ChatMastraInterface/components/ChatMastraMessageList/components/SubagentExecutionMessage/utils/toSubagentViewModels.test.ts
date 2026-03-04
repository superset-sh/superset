import { describe, expect, it } from "bun:test";
import { toSubagentViewModels } from "./toSubagentViewModels";

describe("toSubagentViewModels", () => {
	it("infers completed status when status is missing but result exists", () => {
		const [viewModel] = toSubagentViewModels([
			[
				"tool-1",
				{
					task: "Run subagent",
					result: "Done",
				},
			],
		] as never);

		expect(viewModel.status).toBe("completed");
	});

	it("infers error status when error signal exists", () => {
		const [viewModel] = toSubagentViewModels([
			[
				"tool-2",
				{
					task: "Run subagent",
					error: "Failed",
				},
			],
		] as never);

		expect(viewModel.status).toBe("error");
	});
});
