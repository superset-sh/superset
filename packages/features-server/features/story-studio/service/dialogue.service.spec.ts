jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: "and" })),
  asc: jest.fn((field: any) => ({ field, type: "asc" })),
  desc: jest.fn((field: any) => ({ field, type: "desc" })),
  count: jest.fn(() => ({ type: "count" })),
}));

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  const col = (name: string) => ({ name });
  return {
    DRIZZLE: "DRIZZLE_TOKEN",
    InjectDrizzle: () => Inject("DRIZZLE_TOKEN"),
    storyStudioDialogues: {
      id: col("id"),
      projectId: col("project_id"),
      chapterId: col("chapter_id"),
      branchNodeId: col("branch_node_id"),
      type: col("type"),
      speakerId: col("speaker_id"),
      emotion: col("emotion"),
      content: col("content"),
      direction: col("direction"),
      timing: col("timing"),
      voiceNote: col("voice_note"),
      tags: col("tags"),
      stringId: col("string_id"),
      order: col("order"),
      isDeleted: col("is_deleted"),
      deletedAt: col("deleted_at"),
      createdAt: col("created_at"),
      updatedAt: col("updated_at"),
    },
    storyStudioGraphNodes: {
      id: col("id"),
      projectId: col("project_id"),
      chapterId: col("chapter_id"),
      type: col("type"),
      code: col("code"),
      label: col("label"),
      positionX: col("position_x"),
      positionY: col("position_y"),
      metadata: col("metadata"),
      createdAt: col("created_at"),
      updatedAt: col("updated_at"),
    },
    storyStudioChapters: {
      id: col("id"),
      projectId: col("project_id"),
      title: col("title"),
      code: col("code"),
      order: col("order"),
      summary: col("summary"),
      status: col("status"),
      isDeleted: col("is_deleted"),
      createdAt: col("created_at"),
      updatedAt: col("updated_at"),
    },
  };
});

jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { Test, type TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { DialogueService } from "./dialogue.service";
import { createMockDb, TEST_IDS } from "../../__test-utils__";

describe("DialogueService", () => {
  let service: DialogueService;
  let mockDb: ReturnType<typeof createMockDb>;

  const projectId = TEST_IDS.UUID_1;
  const chapterId = TEST_IDS.UUID_2;
  const nodeId = TEST_IDS.UUID_3;

  const mockNode = {
    id: nodeId,
    projectId,
    chapterId,
    type: "scene",
    code: "SCN_01",
    label: "시작 장면",
    positionX: 0,
    positionY: 0,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockChapter = {
    id: chapterId,
    projectId,
    title: "1장",
    code: "CH01",
    order: 0,
    summary: null,
    status: "outline",
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDialogue = {
    id: "dialogue-1",
    projectId,
    chapterId,
    branchNodeId: nodeId,
    type: "dialogue",
    speakerId: null,
    emotion: null,
    content: "안녕하세요!",
    direction: null,
    timing: null,
    voiceNote: null,
    tags: [],
    stringId: "DLG_CH01_SCN_01_000",
    order: 0,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DialogueService,
        { provide: "DRIZZLE_TOKEN", useValue: mockDb },
      ],
    }).compile();
    service = module.get<DialogueService>(DialogueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // findByNode
  // =========================================================================
  describe("findByNode", () => {
    it("노드의 대사 목록을 반환한다", async () => {
      mockDb.query.storyStudioDialogues.findMany.mockResolvedValue([
        mockDialogue,
      ]);

      const result = await service.findByNode(nodeId);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("안녕하세요!");
    });

    it("빈 목록을 반환한다", async () => {
      mockDb.query.storyStudioDialogues.findMany.mockResolvedValue([]);

      const result = await service.findByNode(nodeId);

      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // findById
  // =========================================================================
  describe("findById", () => {
    it("대사를 ID로 조회한다", async () => {
      mockDb.query.storyStudioDialogues.findFirst.mockResolvedValue(
        mockDialogue,
      );

      const result = await service.findById("dialogue-1");

      expect(result).toEqual(mockDialogue);
    });

    it("존재하지 않으면 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioDialogues.findFirst.mockResolvedValue(null);

      await expect(service.findById("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe("create", () => {
    it("대사를 생성하고 stringId를 자동 생성한다", async () => {
      mockDb.query.storyStudioGraphNodes.findFirst.mockResolvedValue(mockNode);
      mockDb.query.storyStudioChapters.findFirst.mockResolvedValue(mockChapter);
      mockDb._queueResolve("returning", [mockDialogue]);

      const result = await service.create({
        projectId,
        chapterId,
        branchNodeId: nodeId,
        content: "안녕하세요!",
        order: 0,
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(mockDialogue);
    });

    it("노드를 찾을 수 없으면 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioGraphNodes.findFirst.mockResolvedValue(null);

      await expect(
        service.create({
          projectId,
          chapterId,
          branchNodeId: "nonexistent-node",
          content: "테스트",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe("update", () => {
    it("대사를 수정한다", async () => {
      mockDb.query.storyStudioDialogues.findFirst.mockResolvedValue(
        mockDialogue,
      );
      mockDb._queueResolve("returning", [
        { ...mockDialogue, content: "수정됨" },
      ]);

      const result = await service.update("dialogue-1", { content: "수정됨" });

      expect(result.content).toBe("수정됨");
    });

    it("존재하지 않는 대사 수정 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioDialogues.findFirst.mockResolvedValue(null);

      await expect(
        service.update("nonexistent", { content: "수정됨" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // reorder
  // =========================================================================
  describe("reorder", () => {
    it("대사 순서를 재배열한다", async () => {
      const result = await service.reorder(nodeId, [
        "dialogue-2",
        "dialogue-1",
      ]);

      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  // =========================================================================
  // delete (soft)
  // =========================================================================
  describe("delete", () => {
    it("대사를 소프트 삭제한다", async () => {
      mockDb.query.storyStudioDialogues.findFirst.mockResolvedValue(
        mockDialogue,
      );

      const result = await service.delete("dialogue-1");

      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("존재하지 않는 대사 삭제 시 NotFoundException을 던진다", async () => {
      mockDb.query.storyStudioDialogues.findFirst.mockResolvedValue(null);

      await expect(service.delete("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // bulkCreate
  // =========================================================================
  describe("bulkCreate", () => {
    it("여러 대사를 일괄 생성한다", async () => {
      mockDb.query.storyStudioGraphNodes.findFirst.mockResolvedValue(mockNode);
      mockDb.query.storyStudioChapters.findFirst.mockResolvedValue(mockChapter);
      mockDb._queueResolve("returning", [
        { ...mockDialogue, stringId: "DLG_CH01_SCN_01_000" },
      ]);
      mockDb._queueResolve("returning", [
        {
          ...mockDialogue,
          id: "dialogue-2",
          stringId: "DLG_CH01_SCN_01_001",
          content: "반갑습니다!",
          order: 1,
        },
      ]);

      const result = await service.bulkCreate(nodeId, [
        { projectId, chapterId, content: "안녕하세요!" },
        { projectId, chapterId, content: "반갑습니다!" },
      ]);

      expect(result).toHaveLength(2);
    });
  });
});
