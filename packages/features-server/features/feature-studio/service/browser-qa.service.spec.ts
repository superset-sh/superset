import { BrowserQaService } from "./browser-qa.service";

jest.mock("drizzle-orm", () => ({
	eq: jest.fn((field: unknown, value: unknown) => ({
		field,
		value,
		type: "eq",
	})),
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
		};
		_queueResolve: (method: string, value: unknown) => void;
		_resetQueue: () => void;
	};

	const chain = {} as MockDb;

	for (const method of ["insert", "values", "returning", "update", "set", "where"]) {
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
	};

	chain._queueResolve = (method, value) => {
		queue.push({ method, value });
	};
	chain._resetQueue = () => {
		queue.length = 0;
	};

	return chain;
};

describe("BrowserQaService", () => {
	let service: BrowserQaService;
	let mockDb: ReturnType<typeof createMockDb>;
	const originalFetch = global.fetch;

	beforeEach(() => {
		mockDb = createMockDb();
		service = new BrowserQaService(mockDb as never);
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

	it("stores a pending human qa approval after checks pass", async () => {
		mockDb.query.featureRequests.findFirst.mockResolvedValue({
			id: requestId,
			createdById: userId,
		});

		const report = await service.runPreviewChecks({
			featureRequestId: requestId,
			previewUrl: "https://preview.example.com",
		});

		expect(report.summary).toBe("1/1 checks passed");
		expect(mockDb.insert).toHaveBeenCalledTimes(2);
		expect(mockDb.update).toHaveBeenCalled();
	});
});
