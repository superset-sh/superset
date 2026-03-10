import {
  createMockDb,
  DRIZZLE_ORM_MOCK,
  DRIZZLE_BASE_MOCK_WITH_INJECT,
  createTableMock,
  LOGGER_MOCK,
  TEST_IDS,
  TEST_DATES,
} from "../../__test-utils__";

jest.mock("drizzle-orm", () => DRIZZLE_ORM_MOCK);

jest.mock("@/core/logger", () => LOGGER_MOCK);

jest.mock("@superbuilder/drizzle", () => {
  const { Inject } = jest.requireActual("@nestjs/common");
  return {
    ...DRIZZLE_BASE_MOCK_WITH_INJECT(Inject),
    courseAttachments: createTableMock({
      id: "id",
      courseId: "course_id",
      fileId: "file_id",
      url: "url",
      fileType: "file_type",
      title: "title",
      sortOrder: "sort_order",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
    files: createTableMock({
      id: "id",
      name: "name",
      originalName: "original_name",
      mimeType: "mime_type",
      size: "size",
      url: "url",
      uploadedById: "uploaded_by_id",
      createdAt: "created_at",
      updatedAt: "updated_at",
    }),
  };
});

import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DRIZZLE } from "@superbuilder/drizzle";
import { AttachmentService } from "./attachment.service";

// ============================================================================
// Test Data
// ============================================================================

const COURSE_ID = TEST_IDS.UUID_1;
const ATTACHMENT_ID = TEST_IDS.UUID_2;
const ATTACHMENT_ID_2 = TEST_IDS.UUID_3;
const FILE_ID = TEST_IDS.UUID_4;

const MOCK_ATTACHMENT = {
  id: ATTACHMENT_ID,
  courseId: COURSE_ID,
  fileId: FILE_ID,
  url: null,
  fileType: "application/pdf",
  title: "강의 자료 PDF",
  sortOrder: 0,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_ATTACHMENT_2 = {
  id: ATTACHMENT_ID_2,
  courseId: COURSE_ID,
  fileId: null,
  url: "https://example.com/resource.pdf",
  fileType: "application/pdf",
  title: "외부 링크 자료",
  sortOrder: 1,
  createdAt: TEST_DATES.CREATED,
  updatedAt: TEST_DATES.UPDATED,
};

const MOCK_ATTACHMENT_WITH_FILE = {
  ...MOCK_ATTACHMENT,
  file: {
    name: "lecture-notes.pdf",
    url: "https://cdn.example.com/lecture-notes.pdf",
    mimeType: "application/pdf",
    size: 1024000,
  },
};

const MOCK_ATTACHMENT_WITHOUT_FILE = {
  ...MOCK_ATTACHMENT_2,
  file: null,
};

describe("AttachmentService", () => {
  let service: AttachmentService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<AttachmentService>(AttachmentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // findByCourseId
  // ============================================================================
  describe("findByCourseId", () => {
    it("강의의 첨부파일 목록을 파일 정보와 함께 반환한다", async () => {
      mockDb._queueResolve("orderBy", [
        MOCK_ATTACHMENT_WITH_FILE,
        MOCK_ATTACHMENT_WITHOUT_FILE,
      ]);

      const result = await service.findByCourseId(COURSE_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(MOCK_ATTACHMENT_WITH_FILE);
      expect(result[0]!.file).toBeDefined();
      expect(result[0]!.file!.name).toBe("lecture-notes.pdf");
      expect(result[1]!.file).toBeNull();
    });

    it("첨부파일이 없으면 빈 배열을 반환한다", async () => {
      mockDb._queueResolve("orderBy", []);

      const result = await service.findByCourseId(COURSE_ID);

      expect(result).toEqual([]);
    });

    it("sortOrder 오름차순으로 정렬된다", async () => {
      mockDb._queueResolve("orderBy", [
        MOCK_ATTACHMENT_WITH_FILE,
        MOCK_ATTACHMENT_WITHOUT_FILE,
      ]);

      const result = await service.findByCourseId(COURSE_ID);

      expect(result[0]!.sortOrder).toBe(0);
      expect(result[1]!.sortOrder).toBe(1);
    });
  });

  // ============================================================================
  // create
  // ============================================================================
  describe("create", () => {
    it("파일 ID로 첨부파일을 생성한다", async () => {
      // maxOrder query
      mockDb._queueResolve("where", [{ max: 0 }]);
      // insert returning
      mockDb._queueResolve("returning", [{ ...MOCK_ATTACHMENT, sortOrder: 1 }]);

      const result = await service.create({
        courseId: COURSE_ID,
        fileId: FILE_ID,
        fileType: "application/pdf",
        title: "강의 자료 PDF",
      });

      expect(result.courseId).toBe(COURSE_ID);
      expect(result.fileId).toBe(FILE_ID);
      expect(result.sortOrder).toBe(1);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("URL로 첨부파일을 생성한다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [MOCK_ATTACHMENT_2]);

      const result = await service.create({
        courseId: COURSE_ID,
        url: "https://example.com/resource.pdf",
        fileType: "application/pdf",
        title: "외부 링크 자료",
      });

      expect(result.url).toBe("https://example.com/resource.pdf");
      expect(result.fileId).toBeNull();
    });

    it("첫 번째 첨부파일은 sortOrder 0으로 생성된다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [{ ...MOCK_ATTACHMENT, sortOrder: 0 }]);

      const result = await service.create({
        courseId: COURSE_ID,
        fileId: FILE_ID,
        title: "첫 번째 자료",
      });

      expect(result.sortOrder).toBe(0);
    });

    it("maxOrder가 null이면 sortOrder 0으로 생성한다", async () => {
      mockDb._queueResolve("where", [{ max: null }]);
      mockDb._queueResolve("returning", [{ ...MOCK_ATTACHMENT, sortOrder: 0 }]);

      const result = await service.create({
        courseId: COURSE_ID,
        fileId: FILE_ID,
      });

      expect(result.sortOrder).toBe(0);
    });

    it("title 없이 생성할 수 있다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [
        { ...MOCK_ATTACHMENT, title: undefined },
      ]);

      const result = await service.create({
        courseId: COURSE_ID,
        fileId: FILE_ID,
      });

      expect(result).toBeDefined();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("fileId와 url 모두 없이 생성할 수 있다", async () => {
      mockDb._queueResolve("where", [{ max: -1 }]);
      mockDb._queueResolve("returning", [
        { ...MOCK_ATTACHMENT, fileId: null, url: null },
      ]);

      const result = await service.create({
        courseId: COURSE_ID,
        title: "메타데이터만",
      });

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // delete
  // ============================================================================
  describe("delete", () => {
    it("첨부파일을 삭제한다", async () => {
      // attachment lookup
      mockDb._queueResolve("limit", [MOCK_ATTACHMENT]);

      const result = await service.delete(ATTACHMENT_ID);

      expect(result).toEqual({ success: true });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("존재하지 않는 첨부파일 삭제 시 NotFoundException을 던진다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.delete("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("에러 메시지에 ID를 포함한다", async () => {
      mockDb._queueResolve("limit", []);

      await expect(service.delete("missing-id")).rejects.toThrow(
        "Attachment not found: missing-id",
      );
    });
  });

  // ============================================================================
  // reorder
  // ============================================================================
  describe("reorder", () => {
    it("첨부파일 순서를 변경한다", async () => {
      const items = [
        { id: ATTACHMENT_ID, sortOrder: 1 },
        { id: ATTACHMENT_ID_2, sortOrder: 0 },
      ];

      const result = await service.reorder(items);

      expect(result).toEqual({ success: true });
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("빈 배열로 호출 시 성공한다", async () => {
      const result = await service.reorder([]);

      expect(result).toEqual({ success: true });
    });

    it("트랜잭션 내에서 각 아이템을 업데이트한다", async () => {
      const txDb = mockDb._tx;
      const items = [
        { id: ATTACHMENT_ID, sortOrder: 2 },
        { id: ATTACHMENT_ID_2, sortOrder: 0 },
        { id: TEST_IDS.UUID_5, sortOrder: 1 },
      ];

      await service.reorder(items);

      expect(txDb.update).toHaveBeenCalledTimes(3);
    });

    it("단일 아이템 reorder도 정상 동작한다", async () => {
      const items = [{ id: ATTACHMENT_ID, sortOrder: 0 }];

      const result = await service.reorder(items);

      expect(result).toEqual({ success: true });
      expect(mockDb._tx.update).toHaveBeenCalledTimes(1);
    });
  });
});
