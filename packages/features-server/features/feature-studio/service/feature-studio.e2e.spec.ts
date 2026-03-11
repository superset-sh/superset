import { BrowserQaService } from "./browser-qa.service";
import { FeatureRegistrationService } from "./feature-registration.service";
import { FeatureRequestService } from "./feature-request.service";
import { FeatureStudioRunnerService } from "./feature-studio-runner.service";
import type { WorktreeExecutionService } from "./worktree-execution.service";

jest.mock("@superset/agent", () => ({
	generateFeatureStudioPlan: jest.fn().mockResolvedValue("# Plan"),
	generateFeatureStudioSpec: jest.fn().mockResolvedValue("# Spec"),
}));

jest.mock("drizzle-orm", () => ({
	and: jest.fn((...clauses: unknown[]) => ({ clauses, type: "and" })),
	desc: jest.fn((field: unknown) => ({ field, type: "desc" })),
	eq: jest.fn((field: unknown, value: unknown) => ({ field, value, type: "eq" })),
}));

jest.mock("@superbuilder/drizzle", () => ({
	InjectDrizzle: () => () => undefined,
	featureRequests: {
		id: { name: "id" },
		status: { name: "status" },
		createdAt: { name: "created_at" },
	},
	featureRequestMessages: {
		id: { name: "id" },
		createdAt: { name: "created_at" },
	},
	featureRequestApprovals: {
		id: { name: "id" },
		createdAt: { name: "created_at" },
		featureRequestId: { name: "feature_request_id" },
		approvalType: { name: "approval_type" },
		status: { name: "status" },
		updatedAt: { name: "updated_at" },
	},
	featureRequestArtifacts: {
		id: { name: "id" },
		createdAt: { name: "created_at" },
	},
	featureRequestRuns: {
		id: { name: "id" },
	},
	featureRequestWorktrees: {
		id: { name: "id" },
		featureRequestId: { name: "feature_request_id" },
		updatedAt: { name: "updated_at" },
	},
	featureRegistrations: {
		id: { name: "id" },
	},
}));

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
			featureRequestMessages: QuerySection;
			featureRequestArtifacts: QuerySection;
			featureRequestWorktrees: QuerySection;
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
		featureRequestMessages: {
			findFirst: jest.fn(),
			findMany: jest.fn(),
		},
		featureRequestArtifacts: {
			findFirst: jest.fn(),
			findMany: jest.fn(),
		},
		featureRequestWorktrees: {
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

describe("Feature Studio happy path", () => {
	let mockDb: ReturnType<typeof createMockDb>;
	let requestService: FeatureRequestService;
	let runnerService: FeatureStudioRunnerService;
	let browserQaService: BrowserQaService;
	let registrationService: FeatureRegistrationService;
	let worktreeExecutionService: Pick<WorktreeExecutionService, "prepareWorktree">;
	const originalFetch = global.fetch;

	beforeEach(() => {
		mockDb = createMockDb();
		requestService = new FeatureRequestService(mockDb as never);
		worktreeExecutionService = {
			prepareWorktree: jest.fn().mockResolvedValue({
				request: { id: requestId, status: "implementing" },
				branchName: "codex/feature-studio-123e4567",
				worktreePath: "/tmp/feature-studio",
			}),
		};
		runnerService = new FeatureStudioRunnerService(
			mockDb as never,
			worktreeExecutionService as never,
		);
		browserQaService = new BrowserQaService(mockDb as never);
		registrationService = new FeatureRegistrationService(
			mockDb as never,
			{ create: jest.fn() } as never,
		);
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			status: 200,
		} as Response);
	});

	afterEach(() => {
		global.fetch = originalFetch;
		jest.clearAllMocks();
		mockDb._resetQueue();
	});

	it("runs from request creation to pending registration", async () => {
		mockDb._queueResolve("returning", [
			{
				id: requestId,
				status: "draft",
				title: "Lead capture widget",
				rawPrompt: "Build a reusable lead capture widget",
			},
		]);

		const created = await requestService.createRequest(
			{
				title: "Lead capture widget",
				rawPrompt: "Build a reusable lead capture widget",
			},
			userId,
		);

		mockDb.query.featureRequests.findFirst.mockResolvedValueOnce({
			...created,
			rulesetReference: "rules/feature.md",
			createdById: userId,
		});
		mockDb.query.featureRequests.findFirst.mockResolvedValueOnce({
			...created,
			rulesetReference: "rules/feature.md",
			createdById: userId,
			status: "draft",
		});
		mockDb._queueResolve("returning", [{ id: "run_1" }]);
		mockDb._queueResolve("returning", [
			{ id: requestId, status: "pending_spec_approval" },
		]);

		const pendingSpec = await runnerService.advance(requestId);
		if (!("status" in pendingSpec)) {
			throw new Error("Expected feature request status after spec generation");
		}
		expect(pendingSpec.status).toBe("pending_spec_approval");

		mockDb.query.featureRequestApprovals.findFirst.mockResolvedValueOnce({
			id: "approval_spec",
			featureRequestId: requestId,
			approvalType: "spec_plan",
			status: "pending",
		});
		mockDb._queueResolve("returning", [
			{ id: "approval_spec", status: "approved" },
		]);
		await requestService.respondToApproval({
			approvalId: "approval_spec",
			action: "approved",
			decidedById: userId,
		});

		mockDb.query.featureRequestApprovals.findFirst.mockResolvedValueOnce({
			id: "approval_spec",
			featureRequestId: requestId,
			approvalType: "spec_plan",
			status: "approved",
		});
		mockDb._queueResolve("returning", [
			{ id: requestId, status: "plan_approved" },
		]);
		const planApproved = await runnerService.resumeAfterApproval("approval_spec");
		expect(planApproved.status).toBe("plan_approved");

		mockDb.query.featureRequests.findFirst.mockResolvedValueOnce({
			id: requestId,
			title: "Lead capture widget",
			rawPrompt: "Build a reusable lead capture widget",
			status: "plan_approved",
			createdById: userId,
		});
		await runnerService.advance(requestId);
		expect(worktreeExecutionService.prepareWorktree).toHaveBeenCalledWith({
			featureRequestId: requestId,
		});

		mockDb.query.featureRequests.findFirst.mockResolvedValueOnce({
			id: requestId,
			createdById: userId,
		});
		await browserQaService.runPreviewChecks({
			featureRequestId: requestId,
			previewUrl: "https://preview.vercel.app",
		});

		mockDb.query.featureRequestApprovals.findFirst.mockResolvedValueOnce({
			id: "approval_human",
			featureRequestId: requestId,
			approvalType: "human_qa",
			status: "pending",
		});
		mockDb._queueResolve("returning", [
			{ id: "approval_human", status: "approved" },
		]);
		await requestService.respondToApproval({
			approvalId: "approval_human",
			action: "approved",
			decidedById: userId,
		});

		mockDb.query.featureRequestApprovals.findFirst.mockResolvedValueOnce({
			id: "approval_human",
			featureRequestId: requestId,
			approvalType: "human_qa",
			status: "approved",
		});
		mockDb._queueResolve("returning", [
			{ id: requestId, status: "customization" },
		]);
		const customization = await runnerService.resumeAfterApproval(
			"approval_human",
		);
		expect(customization.status).toBe("customization");

		mockDb.query.featureRequests.findFirst.mockResolvedValueOnce({
			id: requestId,
			status: "customization",
			title: "Lead capture widget",
		});
		mockDb._queueResolve("returning", [
			{ id: "approval_registration", status: "pending" },
		]);

		const registrationApproval =
			await registrationService.requestRegistrationApproval(requestId, userId);

		expect(registrationApproval?.status).toBe("pending");
		expect(mockDb.update).toHaveBeenCalledWith(expect.anything());
		expect(mockDb.set).toHaveBeenCalledWith(
			expect.objectContaining({ status: "pending_registration" }),
		);
	});
});
