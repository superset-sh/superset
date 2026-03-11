import { NotFoundException } from "@nestjs/common";
import { FeatureRequestService } from "./feature-request.service";

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: unknown, value: unknown) => ({ field, value, type: "eq" })),
  desc: jest.fn((field: unknown) => ({ field, type: "desc" })),
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
    approvalType: { name: "approval_type" },
  },
  featureRequestArtifacts: {
    id: { name: "id" },
    createdAt: { name: "created_at" },
  },
}));

const userId = "123e4567-e89b-12d3-a456-426614174000";
const requestId = "123e4567-e89b-12d3-a456-426614174001";

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
  };

  chain._queueResolve = (method, value) => {
    queue.push({ method, value });
  };
  chain._resetQueue = () => {
    queue.length = 0;
  };

  return chain;
};

describe("FeatureRequestService", () => {
  let service: FeatureRequestService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new FeatureRequestService(mockDb as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  it("creates a feature request with draft status", async () => {
    mockDb._queueResolve("returning", [
      { id: requestId, status: "draft", title: "Lead capture widget" },
    ]);

    const result = await service.createRequest(
      {
        title: "Lead capture widget",
        rawPrompt: "Build a reusable lead capture widget feature",
      },
      userId,
    );

    expect(result.status).toBe("draft");
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("lists pending approvals separately from requests", async () => {
    mockDb.query.featureRequests.findMany.mockResolvedValue([
      { id: requestId, status: "implementing", title: "Lead capture widget" },
    ]);
    mockDb.query.featureRequestApprovals.findMany.mockResolvedValue([
      { id: "appr_1", approvalType: "spec_plan", status: "pending" },
      { id: "appr_2", approvalType: "human_qa", status: "approved" },
    ]);

    const result = await service.listQueue();

    expect(result.requests).toHaveLength(1);
    expect(result.pendingApprovals).toEqual([
      { id: "appr_1", approvalType: "spec_plan", status: "pending" },
    ]);
  });

  it("updates an approval decision with feedback", async () => {
    mockDb.query.featureRequestApprovals.findFirst.mockResolvedValue({
      id: "appr_1",
      status: "pending",
    });
    mockDb._queueResolve("returning", [
      {
        id: "appr_1",
        status: "approved",
        decisionNotes: "Looks good",
      },
    ]);

    const result = await service.respondToApproval({
      approvalId: "appr_1",
      action: "approved",
      feedback: "Looks good",
      decidedById: userId,
    });

    expect(result.status).toBe("approved");
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("moves rejected human qa approvals back to customization", async () => {
    mockDb.query.featureRequestApprovals.findFirst.mockResolvedValue({
      id: "appr_2",
      featureRequestId: requestId,
      approvalType: "human_qa",
      status: "pending",
    });
    mockDb._queueResolve("returning", [
      {
        id: "appr_2",
        status: "rejected",
        decisionNotes: "Update the empty state copy",
      },
    ]);

    const result = await service.respondToApproval({
      approvalId: "appr_2",
      action: "rejected",
      feedback: "Update the empty state copy",
      decidedById: userId,
    });

    expect(result.status).toBe("rejected");
    expect(mockDb.update).toHaveBeenCalledTimes(2);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it("throws when appending a message to an unknown request", async () => {
    mockDb.query.featureRequests.findFirst.mockResolvedValue(null);

    await expect(
      service.appendMessage({
        featureRequestId: requestId,
        role: "user",
        content: "hello",
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
