import { FeatureStudioRunnerService } from "./feature-studio-runner.service";

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
	},
}));

const { generateFeatureStudioPlan, generateFeatureStudioSpec } =
	jest.requireMock("@superset/agent") as {
		generateFeatureStudioPlan: jest.Mock;
		generateFeatureStudioSpec: jest.Mock;
	};

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

	beforeEach(() => {
		mockDb = createMockDb();
		service = new FeatureStudioRunnerService(mockDb as never);
		generateFeatureStudioSpec.mockReset();
		generateFeatureStudioPlan.mockReset();
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
		generateFeatureStudioSpec.mockResolvedValue("# Spec");
		generateFeatureStudioPlan.mockResolvedValue("# Plan");
		mockDb._queueResolve("returning", [{ id: "run_1" }]);
		mockDb._queueResolve("returning", [
			{ id: requestId, status: "pending_spec_approval" },
		]);

		const result = await service.advance(requestId);

		expect(generateFeatureStudioSpec).toHaveBeenCalled();
		expect(generateFeatureStudioPlan).toHaveBeenCalled();
		expect(result.status).toBe("pending_spec_approval");
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
});
