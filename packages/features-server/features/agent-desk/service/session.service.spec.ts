import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SessionService } from "./session.service";

// Mock Drizzle ORM functions
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  desc: jest.fn((field: any) => ({ field, type: "desc" })),
  sum: jest.fn((field: any) => ({ field, type: "sum" })),
}));

// Mock schema tables
jest.mock("@superbuilder/drizzle", () => ({
  DRIZZLE: "DRIZZLE_TOKEN",
  InjectDrizzle: () => () => undefined,
  agentDeskSessions: {
    id: { name: "id" },
    type: { name: "type" },
    status: { name: "status" },
    title: { name: "title" },
    prompt: { name: "prompt" },
    createdById: { name: "created_by_id" },
    createdAt: { name: "created_at" },
    updatedAt: { name: "updated_at" },
  },
  agentDeskFiles: {
    id: { name: "id" },
    sessionId: { name: "session_id" },
    fileName: { name: "file_name" },
    originalName: { name: "original_name" },
    mimeType: { name: "mime_type" },
    size: { name: "size" },
    storageUrl: { name: "storage_url" },
    parsedContent: { name: "parsed_content" },
    parsedAt: { name: "parsed_at" },
    createdAt: { name: "created_at" },
  },
  agentDeskMessages: {
    id: { name: "id" },
    sessionId: { name: "session_id" },
    role: { name: "role" },
    content: { name: "content" },
    createdAt: { name: "created_at" },
  },
}));

// Mock logger
jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock data
const mockUserId = "123e4567-e89b-12d3-a456-426614174000";
const mockSessionId = "223e4567-e89b-12d3-a456-426614174001";
const mockFileId = "323e4567-e89b-12d3-a456-426614174002";
const mockMessageId = "423e4567-e89b-12d3-a456-426614174003";

const mockSession = {
  id: mockSessionId,
  type: "customer" as const,
  status: "chatting" as const,
  title: "새 서비스 상담",
  prompt: null,
  createdById: mockUserId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFile = {
  id: mockFileId,
  sessionId: mockSessionId,
  fileName: "test-file.pdf",
  originalName: "test.pdf",
  mimeType: "application/pdf",
  size: 1024,
  storageUrl: "https://storage.example.com/test.pdf",
  parsedContent: null,
  parsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMessage = {
  id: mockMessageId,
  sessionId: mockSessionId,
  role: "agent" as const,
  content: "안녕하세요!",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock Drizzle DB - creates a chainable mock that tracks calls
const createMockDb = () => {
  const resolveQueue: any[] = [];

  const createChainable = () => {
    const chain: any = {};
    const methods = [
      "select",
      "from",
      "where",
      "limit",
      "offset",
      "orderBy",
      "insert",
      "values",
      "returning",
      "update",
      "set",
      "delete",
    ];

    methods.forEach((method) => {
      chain[method] = jest.fn().mockImplementation(() => {
        if (resolveQueue.length > 0) {
          const nextResolve = resolveQueue[0];
          if (nextResolve.method === method || nextResolve.method === "any") {
            resolveQueue.shift();
            return Promise.resolve(nextResolve.value);
          }
        }
        return chain;
      });
    });

    // Mock query builder for findFirst/findMany
    chain.query = {
      agentDeskSessions: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      agentDeskFiles: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      agentDeskMessages: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    chain._queueResolve = (method: string, value: any) => {
      resolveQueue.push({ method, value });
    };

    chain._resetQueue = () => {
      resolveQueue.length = 0;
    };

    return chain;
  };

  return createChainable();
};

describe("SessionService", () => {
  let service: SessionService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    // Directly construct service with mock DB (bypasses NestJS DI)
    service = new SessionService(mockDb as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  describe("create", () => {
    it("should create a session and return it", async () => {
      mockDb._queueResolve("returning", [mockSession]);

      const result = await service.create(
        { type: "customer", title: "새 서비스 상담" },
        mockUserId,
      );

      expect(result).toEqual(mockSession);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
    });

    it("should throw BadRequestException when insert fails", async () => {
      mockDb._queueResolve("returning", []);

      await expect(service.create({ type: "customer" }, mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("findById", () => {
    it("should return session when found", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);

      const result = await service.findById(mockSessionId);
      expect(result).toEqual(mockSession);
    });

    it("should throw NotFoundException when session not found", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(null);

      await expect(service.findById("nonexistent")).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByIdWithRelations", () => {
    it("should return session with files and messages", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([mockFile]);
      mockDb.query.agentDeskMessages.findMany.mockResolvedValue([mockMessage]);

      const result = await service.findByIdWithRelations(mockSessionId);

      expect(result).toEqual({
        ...mockSession,
        files: [mockFile],
        messages: [mockMessage],
      });
    });
  });

  describe("listByUser", () => {
    it("should return user sessions", async () => {
      mockDb.query.agentDeskSessions.findMany.mockResolvedValue([mockSession]);

      const result = await service.listByUser(mockUserId);

      expect(result).toEqual([mockSession]);
      expect(mockDb.query.agentDeskSessions.findMany).toHaveBeenCalled();
    });

    it("should filter by type when provided", async () => {
      mockDb.query.agentDeskSessions.findMany.mockResolvedValue([mockSession]);

      const result = await service.listByUser(mockUserId, "customer");

      expect(result).toEqual([mockSession]);
    });
  });

  describe("updateStatus", () => {
    it("should update session status", async () => {
      const updatedSession = { ...mockSession, status: "analyzing" as const };
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb._queueResolve("returning", [updatedSession]);

      const result = await service.updateStatus(mockSessionId, "analyzing");

      expect(result.status).toBe("analyzing");
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("should throw NotFoundException for non-existent session", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus("nonexistent", "analyzing")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException when update fails", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb._queueResolve("returning", []);

      await expect(service.updateStatus(mockSessionId, "analyzing")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("delete", () => {
    it("should delete session and return success", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(mockSession);
      mockDb._queueResolve("where", undefined);

      const result = await service.delete(mockSessionId);

      expect(result).toEqual({ success: true });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("should throw NotFoundException for non-existent session", async () => {
      mockDb.query.agentDeskSessions.findFirst.mockResolvedValue(null);

      await expect(service.delete("nonexistent")).rejects.toThrow(NotFoundException);
    });
  });

  describe("addFile", () => {
    it("should add file to session", async () => {
      // getTotalFileSize: select().from().where() → [{total: 0}]
      mockDb._queueResolve("where", [{ total: 0 }]);
      // addFile insert: insert().values().returning() → [mockFile]
      mockDb._queueResolve("returning", [mockFile]);

      const result = await service.addFile({
        sessionId: mockSessionId,
        fileName: "test-file.pdf",
        originalName: "test.pdf",
        mimeType: "application/pdf",
        size: 1024,
        storageUrl: "https://storage.example.com/test.pdf",
      });

      expect(result).toEqual(mockFile);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should throw BadRequestException when file size exceeds limit", async () => {
      // getTotalFileSize returns 199MB already used
      mockDb._queueResolve("where", [{ total: 199 * 1024 * 1024 }]);

      await expect(
        service.addFile({
          sessionId: mockSessionId,
          fileName: "large.pdf",
          originalName: "large.pdf",
          mimeType: "application/pdf",
          size: 2 * 1024 * 1024, // 2MB — would exceed 200MB limit
          storageUrl: "https://example.com/large.pdf",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when insert fails", async () => {
      // getTotalFileSize returns 0
      mockDb._queueResolve("where", [{ total: 0 }]);
      // insert returns empty
      mockDb._queueResolve("returning", []);

      await expect(
        service.addFile({
          sessionId: mockSessionId,
          fileName: "test.pdf",
          originalName: "test.pdf",
          mimeType: "application/pdf",
          size: 1024,
          storageUrl: "https://example.com/test.pdf",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("removeFile", () => {
    it("should remove file and return success", async () => {
      mockDb._queueResolve("where", undefined);

      const result = await service.removeFile(mockFileId);

      expect(result).toEqual({ success: true });
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe("getFiles", () => {
    it("should return files for session", async () => {
      mockDb.query.agentDeskFiles.findMany.mockResolvedValue([mockFile]);

      const result = await service.getFiles(mockSessionId);

      expect(result).toEqual([mockFile]);
    });
  });

  describe("addMessage", () => {
    it("should add message to session", async () => {
      mockDb._queueResolve("returning", [mockMessage]);

      const result = await service.addMessage(mockSessionId, "agent", "안녕하세요!");

      expect(result).toEqual(mockMessage);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should throw BadRequestException when insert fails", async () => {
      mockDb._queueResolve("returning", []);

      await expect(service.addMessage(mockSessionId, "user", "test")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("getMessages", () => {
    it("should return messages for session ordered by createdAt", async () => {
      const messages = [mockMessage, { ...mockMessage, id: "another-id", content: "두번째" }];
      mockDb.query.agentDeskMessages.findMany.mockResolvedValue(messages);

      const result = await service.getMessages(mockSessionId);

      expect(result).toEqual(messages);
      expect(result).toHaveLength(2);
    });
  });
});
