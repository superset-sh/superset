import { FeatureStudioRunnerService } from "./feature-studio-runner.service";
import type { WorktreeExecutionService } from "./worktree-execution.service";
import type { BrowserQaService } from "./browser-qa.service";

jest.mock("@superset/agent", () => ({
	generateFeatureStudioPlan: jest.fn(),
	generateFeatureStudioSpec: jest.fn(),
}));

jest.mock("drizzle-orm", () => ({
	eq: jest.fn((field: unknown, value: unknown) => ({
		field,
		value,
		type: "eq",
	})),
	desc: jest.fn((field: unknown) => ({ field, type: "desc" })),
}));

jest.mock("@superbuilder/drizzle", () => ({
	InjectDrizzle: () => () => undefined,
	featureRequests: {
		id: { name: "id" },
		status: { name: "status" },
	},
	featureRequestArtifacts: {
		id: { name: "id" },
	},
	featureRequestApprovals: {
		id: { name: "id" },
	},
	featureRequestRuns: {
		id: { name: "id" },
		status: { name: "status" },
		lastError: { name: "lastError" },
		retryCount: { name: "retryCount" },
	},
}));

// Import the mocked module - jest.mock hoists to top so these are already mocked
import {
	generateFeatureStudioPlan,
	generateFeatureStudioSpec,
} from "@superset/agent";
const generateFeatureStudioPlanMock =
	generateFeatureStudioPlan as unknown as jest.Mock;
const generateFeatureStudioSpecMock =
	generateFeatureStudioSpec as unknown as jest.Mock;

const requestId = "123e4567-e89b-12d3-a456-426614174099";
const userId = "123e4567-e89b-12d3-a456-426614174000";

const createMockDb = () => {
	const queue: Array<{ method: string; value: unknown }> = [];
	type QuerySection = {
		findFirst: jest.Mock;
		findMany: jest.Mock;
	};
	type MockDb = Record<string, jest.Mock> & {
		query: {
			featureRequests: QuerySection;
			featureRequestApprovals: QuerySection;
			featureRequestArtifacts: QuerySection;
		};
		_queueResolve: (method: string, value: unknown) => void;
		_resetQueue: () => void;
	};

	const chain = {} as MockDb;

	for (const method of [
		"insert",
		"values",
		"returning",
		"update",
		"set",
		"where",
	]) {
		chain[method] = jest.fn().mockImplementation(() => {
			const next = queue[0];
			if (next && (next.method === method || next.method === "any")) {
				queue.shift();
				return Promise.resolve(next.value);
			}
			return chain;
		});
	}

	chain.query = {
		featureRequests: {
			findFirst: jest.fn(),
			findMany: jest.fn(),
		},
		featureRequestApprovals: {
			findFirst: jest.fn(),
			findMany: jest.fn(),
		},
		featureRequestArtifacts: {
			findFirst: jest.fn(),
			findMany: jest.fn(),
		},
	};

	chain._queueResolve = (method, value) => {
		queue.push({ method, value });
	};
	chain._resetQueue = () => {
		queue.length = 0;
	};

	return chain;
};

describe("FeatureStudioRunnerService", () => {
	let service: FeatureStudioRunnerService;
	let mockDb: ReturnType<typeof createMockDb>;
	let worktreeExecutionService: Pick<WorktreeExecutionService, "prepareWorktree">;
	let browserQaService: Pick<BrowserQaService, never>;

	beforeEach(() => {
		mockDb = createMockDb();
		worktreeExecutionService = {
			prepareWorktree: jest.fn(),
		};
		browserQaService = {};
		service = new FeatureStudioRunnerService(
			mockDb as never,
			worktreeExecutionService as never,
			browserQaService as never,
		);
		generateFeatureStudioSpecMock.mockReset();
		generateFeatureStudioPlanMock.mockReset();
	});

	afterEach(() => {
		jest.clearAllMocks();
		mockDb._resetQueue();
	});

	it("moves a draft request to pending_spec_approval after generating spec and plan", async () => {
		mockDb.query.featureRequests.findFirst.mockResolvedValue({
			id: requestId,
			title: "Lead capture widget",
			rawPrompt: "Build a reusable lead capture widget",
			rulesetReference: "rules/feature.md",
			status: "draft",
			createdById: userId,
		});
		generateFeatureStudioSpecMock.mockResolvedValue("# Spec");
		generateFeatureStudioPlanMock.mockResolvedValue("# Plan");
		mockDb._queueResolve("returning", [{ id: "run_1" }]);
		mockDb._queueResolve("returning", [
			{ id: requestId, status: "pending_spec_approval" },
		]);

		const result = await service.advance(requestId);

		expect(generateFeatureStudioSpecMock).toHaveBeenCalled();
		expect(generateFeatureStudioPlanMock).toHaveBeenCalled();
		if (!("status" in result)) {
			throw new Error("Expected a feature request result");
		}
		expect(result.status).toBe("pending_spec_approval");
	});

	it("marks the request and run as failed when spec generation errors", async () => {
		mockDb.query.featureRequests.findFirst.mockResolvedValue({
			id: requestId,
			title: "Lead capture widget",
			rawPrompt: "Build a reusable lead capture widget",
			rulesetReference: "rules/feature.md",
			status: "draft",
			createdById: userId,
		});
		generateFeatureStudioSpecMock.mockRejectedValue(
			new Error("Could not find API key process.env.ANTHROPIC_API_KEY"),
		);
		mockDb._queueResolve("returning", [{ id: "run_1" }]);

		await expect(service.advance(requestId)).rejects.toThrow(
			"Could not find API key process.env.ANTHROPIC_API_KEY",
		);
		expect(mockDb.update).toHaveBeenCalledTimes(2);
		expect(mockDb.set).toHaveBeenNthCalledWith(1, {
			status: "failed",
			lastError: "Could not find API key process.env.ANTHROPIC_API_KEY",
			retryCount: 1,
		});
		expect(mockDb.set).toHaveBeenNthCalledWith(2, {
			status: "failed",
			currentRunId: "run_1",
		});
	});

	it("moves an approved spec approval to plan_approved on resume", async () => {
		mockDb.query.featureRequestApprovals.findFirst.mockResolvedValue({
			id: "approval_1",
			featureRequestId: requestId,
			approvalType: "spec_plan",
			status: "approved",
		});
		mockDb._queueResolve("returning", [
			{ id: requestId, status: "plan_approved" },
		]);

		const result = await service.resumeAfterApproval("approval_1");

		expect(result.status).toBe("plan_approved");
		expect(mockDb.update).toHaveBeenCalled();
	});

	it("moves an approved human qa approval to customization on resume", async () => {
		mockDb.query.featureRequestApprovals.findFirst.mockResolvedValue({
			id: "approval_2",
			featureRequestId: requestId,
			approvalType: "human_qa",
			status: "approved",
		});
		mockDb._queueResolve("returning", [
			{ id: requestId, status: "customization" },
		]);

		const result = await service.resumeAfterApproval("approval_2");

		expect(result.status).toBe("customization");
		expect(mockDb.update).toHaveBeenCalled();
	});

	it("prepares a worktree when the approved plan is advanced", async () => {
		mockDb.query.featureRequests.findFirst.mockResolvedValue({
			id: requestId,
			title: "Lead capture widget",
			rawPrompt: "Build a reusable lead capture widget",
			status: "plan_approved",
			createdById: userId,
		});
		(worktreeExecutionService.prepareWorktree as jest.Mock).mockResolvedValue({
			branchName: "codex/feature-studio-123e4567",
			worktreePath: "/tmp/feature-studio-worktrees/codex-feature-studio-123e4567",
		});

		const result = await service.advance(requestId);

		expect(worktreeExecutionService.prepareWorktree).toHaveBeenCalledWith({
			featureRequestId: requestId,
		});
		if (!("worktreePath" in result)) {
			throw new Error("Expected a worktree preparation result");
		}
		expect(result.worktreePath).toContain("feature-studio-worktrees");
	});
});
