import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FileParserService } from "./file-parser.service";

// ============================================================================
// Module mocks
// ============================================================================

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: "eq" })),
}));

jest.mock("@superbuilder/drizzle", () => ({
  DRIZZLE: "DRIZZLE_TOKEN",
  InjectDrizzle: () => () => undefined,
  agentDeskFiles: {
    id: { name: "id" },
    sessionId: { name: "session_id" },
    parsedContent: { name: "parsed_content" },
    parsedAt: { name: "parsed_at" },
    size: { name: "size" },
  },
}));

jest.mock("@/core/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock("@/features/ai", () => ({
  LLMService: jest.fn(),
}));

// ============================================================================
// Mock data
// ============================================================================

const mockFileId = "file-001";

const createMockFile = (
  overrides: Partial<{
    id: string;
    sessionId: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    size: number;
    storageUrl: string;
    parsedContent: string | null;
    parsedAt: Date | null;
  }> = {},
) => ({
  id: mockFileId,
  sessionId: "session-001",
  fileName: "test.pdf",
  originalName: "test.pdf",
  mimeType: "application/pdf",
  size: 1024,
  storageUrl: "https://storage.example.com/test.pdf",
  parsedContent: null,
  parsedAt: null,
  ...overrides,
});

// PDF magic bytes: %PDF
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

// ZIP/PPTX/DOCX magic bytes: PK\x03\x04
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

// PNG magic bytes
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// JPEG magic bytes
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

// ============================================================================
// Mock DB
// ============================================================================

const createChainableMockDb = () => {
  let updateResolve: any = undefined;

  const chain: any = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockImplementation(() => {
      if (updateResolve !== undefined) {
        const val = updateResolve;
        updateResolve = undefined;
        return Promise.resolve(val);
      }
      return chain;
    }),
    query: {
      agentDeskFiles: {
        findFirst: jest.fn(),
      },
    },
    _queueUpdateResolve: (value: any) => {
      updateResolve = value;
    },
  };

  return chain;
};

// ============================================================================
// Mock LLM Service
// ============================================================================

const mockLlmService = {
  describeImage: jest.fn(),
  chatCompletion: jest.fn(),
};

// ============================================================================
// Global fetch mock
// ============================================================================

const originalFetch = globalThis.fetch;

function mockFetchResponse(buffer: Buffer) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    arrayBuffer: () =>
      Promise.resolve(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      ),
  }) as any;
}

// ============================================================================
// Tests
// ============================================================================

describe("FileParserService", () => {
  let service: FileParserService;
  let mockDb: ReturnType<typeof createChainableMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createChainableMockDb();
    const mockConfigService = { get: jest.fn((key: string) => {
      if (key === "SUPABASE_URL") return "https://mock.supabase.co";
      if (key === "SUPABASE_SECRET_KEY") return "mock-secret-key";
      return undefined;
    }) };
    service = new FileParserService(mockDb as any, mockLlmService as any, mockConfigService as any);
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  // =========================================================================
  // parseFile — file not found
  // =========================================================================
  describe("parseFile — file not found", () => {
    it("파일이 없으면 NotFoundException을 던진다", async () => {
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(null);

      await expect(service.parseFile(mockFileId)).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // parseFile — text/plain
  // =========================================================================
  describe("parseFile — text/plain", () => {
    it("텍스트 파일을 UTF-8로 파싱한다", async () => {
      const textContent = "Hello World\n이것은 텍스트 파일입니다.";
      const buffer = Buffer.from(textContent, "utf-8");

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "text/plain", originalName: "readme.txt" }),
      );
      mockFetchResponse(buffer);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toBe(textContent);
      expect(result.mimeType).toBe("text/plain");
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // parseFile — text/markdown with frontmatter
  // =========================================================================
  describe("parseFile — markdown", () => {
    it("마크다운 프론트매터를 제거한다", async () => {
      const mdContent = "---\ntitle: Test\n---\n# Hello\nBody content";
      const buffer = Buffer.from(mdContent, "utf-8");

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "text/markdown", originalName: "doc.md" }),
      );
      mockFetchResponse(buffer);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toBe("# Hello\nBody content");
      expect(result.content).not.toContain("title: Test");
    });

    it("프론트매터가 없는 마크다운은 그대로 반환한다", async () => {
      const mdContent = "# Hello\nBody content";
      const buffer = Buffer.from(mdContent, "utf-8");

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "text/markdown", originalName: "doc.md" }),
      );
      mockFetchResponse(buffer);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toBe("# Hello\nBody content");
    });
  });

  // =========================================================================
  // parseFile — image
  // =========================================================================
  describe("parseFile — image", () => {
    it("이미지를 LLM Vision으로 분석한다", async () => {
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "image/png", originalName: "diagram.png" }),
      );
      mockFetchResponse(PNG_MAGIC);
      mockLlmService.describeImage.mockResolvedValue("시스템 아키텍처 다이어그램입니다.");
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("이미지: diagram.png");
      expect(result.content).toContain("시스템 아키텍처 다이어그램입니다.");
      expect(result.metadata).toEqual({ imageDescription: expect.any(String) });
      expect(mockLlmService.describeImage).toHaveBeenCalled();
    });

    it("LLM Vision 실패 시 fallback 메시지를 반환한다", async () => {
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "image/jpeg", originalName: "photo.jpg" }),
      );
      mockFetchResponse(JPEG_MAGIC);
      mockLlmService.describeImage.mockRejectedValue(new Error("API timeout"));
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("이미지 파일: photo.jpg");
      expect(result.content).toContain("LLM 분석 실패");
    });
  });

  // =========================================================================
  // parseFile — DOCX (private method spied)
  // =========================================================================
  describe("parseFile — DOCX", () => {
    it("DOCX 파일의 parseDocx 결과를 반환한다", async () => {
      jest.spyOn(service as any, "parseDocx").mockResolvedValue({
        content: "첫 번째 단락\n\n두 번째 단락",
        paragraphCount: 2,
      });

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          originalName: "document.docx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toBe("첫 번째 단락\n\n두 번째 단락");
      expect(result.metadata).toEqual({ pageCount: 2 });
    });

    it(".doc 확장자도 DOCX 파서로 처리한다", async () => {
      jest.spyOn(service as any, "parseDocx").mockResolvedValue({
        content: "테스트 내용",
        paragraphCount: 1,
      });

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/msword",
          originalName: "old-doc.doc",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toBe("테스트 내용");
      expect((service as any).parseDocx).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // parseFile — PPTX (private method spied)
  // =========================================================================
  describe("parseFile — PPTX", () => {
    it("PPTX 파일의 parsePptx 결과를 반환한다", async () => {
      jest.spyOn(service as any, "parsePptx").mockResolvedValue({
        content: "## 슬라이드 1\n\n슬라이드 내용",
        slideCount: 1,
      });

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          originalName: "presentation.pptx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toBe("## 슬라이드 1\n\n슬라이드 내용");
      expect(result.metadata).toEqual({ slideCount: 1 });
    });
  });

  // =========================================================================
  // parseFile — unknown MIME type
  // =========================================================================
  describe("parseFile — unknown MIME", () => {
    it("알 수 없는 MIME 타입은 UTF-8로 fallback 처리한다", async () => {
      const content = "Some unknown content";
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "application/octet-stream", originalName: "data.bin" }),
      );
      mockFetchResponse(Buffer.from(content, "utf-8"));
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toBe(content);
    });
  });

  // =========================================================================
  // parseFile — fetch/parse error handling
  // =========================================================================
  describe("parseFile — error handling", () => {
    it("fetch 실패 시 에러 메시지를 content에 포함한다", async () => {
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(createMockFile());
      globalThis.fetch = jest.fn().mockRejectedValue(new Error("Network error")) as any;
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("파일 파싱 실패");
      expect(result.content).toContain("Network error");
    });

    it("BadRequestException은 그대로 throw한다", async () => {
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "application/pdf", originalName: "fake.pdf" }),
      );
      mockFetchResponse(PDF_MAGIC);

      // validateMagicBytes에서 BadRequestException이 발생하면 parseFile이 재throw하는지 확인
      jest.spyOn(service as any, "validateMagicBytes").mockImplementation(() => {
        throw new BadRequestException("파일 타입 불일치");
      });

      await expect(service.parseFile(mockFileId)).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // parseFile — result structure
  // =========================================================================
  describe("parseFile — result structure", () => {
    it("ParsedFileResult 구조를 올바르게 반환한다", async () => {
      const textContent = "Test content";
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "text/plain", originalName: "test.txt" }),
      );
      mockFetchResponse(Buffer.from(textContent, "utf-8"));
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result).toEqual({
        fileId: mockFileId,
        fileName: "test.txt",
        mimeType: "text/plain",
        content: textContent,
        metadata: {},
      });
    });

    it("DB에 parsedContent와 parsedAt를 업데이트한다", async () => {
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "text/plain", originalName: "test.txt" }),
      );
      mockFetchResponse(Buffer.from("content", "utf-8"));
      mockDb._queueUpdateResolve(undefined);

      await service.parseFile(mockFileId);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          parsedContent: "content",
          parsedAt: expect.any(Date),
        }),
      );
    });
  });

  // =========================================================================
  // magic bytes detection (via validateMagicBytes)
  // =========================================================================
  describe("magic bytes detection", () => {
    it("PDF magic bytes를 감지한다", async () => {
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "application/pdf", originalName: "test.pdf" }),
      );
      mockFetchResponse(PDF_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);
      // Should not throw — magic bytes match PDF claim
      expect(result.fileId).toBe(mockFileId);
    });

    it("MIME 불일치 시 허용된 타입이면 경고만 남긴다", async () => {
      // Claimed: image/jpeg, Actual: image/png → both allowed → just warn
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "image/jpeg", originalName: "photo.jpg" }),
      );
      mockFetchResponse(PNG_MAGIC);
      mockLlmService.describeImage.mockResolvedValue("이미지 설명");
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);
      expect(result.fileId).toBe(mockFileId);
    });

    it("MIME 불일치 시 감지된 타입이 허용 목록에 있으면 에러 없이 진행한다", async () => {
      // Claimed: application/pdf, Actual: image/png → both in ALLOWED_MIME_TYPES → warn only
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "application/pdf", originalName: "fake.pdf" }),
      );
      mockFetchResponse(PNG_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);
      // Service continues processing (falls through to PDF parser which returns fallback)
      expect(result.fileId).toBe(mockFileId);
    });

    it("DOCX는 ZIP magic bytes로 정상 처리한다 (Office XML 예외)", async () => {
      jest.spyOn(service as any, "parseDocx").mockResolvedValue({
        content: "내용",
        paragraphCount: 1,
      });

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          originalName: "doc.docx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);
      // Should not throw — ZIP magic is accepted for Office XML
      expect(result.fileId).toBe(mockFileId);
    });

    it("텍스트 파일은 magic bytes 검증을 스킵한다", async () => {
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "text/plain", originalName: "test.txt" }),
      );
      // Even if we send PDF magic bytes, text/plain skips validation
      mockFetchResponse(Buffer.concat([PDF_MAGIC, Buffer.from("text content")]));
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);
      expect(result.fileId).toBe(mockFileId);
    });

    it("4바이트 미만 버퍼는 magic bytes 검증을 스킵한다", async () => {
      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "application/pdf", originalName: "tiny.pdf" }),
      );
      mockFetchResponse(Buffer.from([0x00, 0x01]));
      mockDb._queueUpdateResolve(undefined);

      // Should not throw for magic bytes — too small to detect
      const result = await service.parseFile(mockFileId);
      expect(result.fileId).toBe(mockFileId);
    });
  });

  // =========================================================================
  // extractTextFromXml (direct unit tests — no jszip needed)
  // =========================================================================
  describe("extractTextFromXml", () => {
    it("PPTX 슬라이드 XML에서 텍스트를 추출한다", () => {
      const slideXml = `<p:sld>
        <a:p><a:r><a:t>슬라이드 제목</a:t></a:r></a:p>
        <a:p><a:r><a:t>슬라이드 내용</a:t></a:r></a:p>
      </p:sld>`;

      const result = (service as any).extractTextFromXml(slideXml);

      expect(result).toContain("슬라이드 제목");
      expect(result).toContain("슬라이드 내용");
    });

    it("HTML 엔티티를 디코딩한다", () => {
      const slideXml = `<p:sld>
        <a:p><a:r><a:t>A &amp; B &lt; C &gt; D</a:t></a:r></a:p>
      </p:sld>`;

      const result = (service as any).extractTextFromXml(slideXml);

      expect(result).toContain("A & B < C > D");
    });

    it("여러 <a:t> 요소를 단락별로 합친다", () => {
      const xml = `<root>
        <a:p><a:r><a:t>파트1</a:t></a:r><a:r><a:t>파트2</a:t></a:r></a:p>
        <a:p><a:r><a:t>다른 단락</a:t></a:r></a:p>
      </root>`;

      const result = (service as any).extractTextFromXml(xml);

      expect(result).toContain("파트1파트2");
      expect(result).toContain("다른 단락");
    });

    it("빈 XML은 빈 문자열을 반환한다", () => {
      const result = (service as any).extractTextFromXml("<root></root>");
      expect(result).toBe("");
    });
  });

  // =========================================================================
  // extractDocxParagraphs (direct unit tests — no jszip needed)
  // =========================================================================
  describe("extractDocxParagraphs", () => {
    it("DOCX XML에서 단락과 스타일을 추출한다", () => {
      const docXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>제목입니다</w:t></w:r></w:p>
    <w:p><w:r><w:t>본문입니다</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>소제목</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      const result: Array<{ text: string; styleId: string }> = (
        service as any
      ).extractDocxParagraphs(docXml);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ text: "제목입니다", styleId: "Heading1" });
      expect(result[1]).toEqual({ text: "본문입니다", styleId: "" });
      expect(result[2]).toEqual({ text: "소제목", styleId: "Heading2" });
    });

    it("HTML 엔티티를 디코딩한다", () => {
      const docXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>A &amp; B &lt;test&gt; &quot;quoted&quot;</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      const result: Array<{ text: string; styleId: string }> = (
        service as any
      ).extractDocxParagraphs(docXml);

      expect(result).toHaveLength(1);
      expect(result[0]!.text).toBe('A & B <test> "quoted"');
    });

    it("여러 <w:t> 요소를 합친다", () => {
      const docXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>파트</w:t></w:r><w:r><w:t>합침</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      const result: Array<{ text: string; styleId: string }> = (
        service as any
      ).extractDocxParagraphs(docXml);

      expect(result).toHaveLength(1);
      expect(result[0]!.text).toBe("파트합침");
    });

    it("빈 단락도 추출한다 (빈 텍스트)", () => {
      const docXml = `<w:document><w:body>
    <w:p></w:p>
  </w:body></w:document>`;

      const result: Array<{ text: string; styleId: string }> = (
        service as any
      ).extractDocxParagraphs(docXml);

      expect(result).toHaveLength(1);
      expect(result[0]!.text).toBe("");
      expect(result[0]!.styleId).toBe("");
    });
  });

  // =========================================================================
  // validateMagicBytes — BadRequestException for disallowed detected MIME
  // =========================================================================
  describe("validateMagicBytes — disallowed MIME throws", () => {
    it("감지된 MIME이 허용 목록에 없고 ZIP도 아니면 BadRequestException을 던진다", async () => {
      // Use a fake magic bytes that detectMimeFromMagicBytes won't recognize,
      // but mock detectMimeFromMagicBytes to return a disallowed MIME
      const fakeBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);

      jest
        .spyOn(service as any, "detectMimeFromMagicBytes")
        .mockReturnValue("application/x-executable");

      expect(() =>
        (service as any).validateMagicBytes(fakeBuffer, "application/pdf", "file.pdf"),
      ).toThrow(BadRequestException);
    });

    it("감지된 MIME이 application/zip이면 BadRequestException을 던지지 않는다", () => {
      const fakeBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);

      jest.spyOn(service as any, "detectMimeFromMagicBytes").mockReturnValue("application/zip");

      // application/zip detected but claimed is something else → warn only, no throw
      expect(() =>
        (service as any).validateMagicBytes(fakeBuffer, "application/pdf", "file.pdf"),
      ).not.toThrow();
    });
  });

  // =========================================================================
  // parsePdf (actual logic via loadPdfParse spy)
  // =========================================================================
  describe("parsePdf — actual logic", () => {
    it("PDF 페이지별 포맷팅된 콘텐츠를 반환한다", async () => {
      const mockParser = {
        getText: jest.fn().mockResolvedValue({
          text: "전체 텍스트",
          pages: [{ text: "페이지 1 내용" }, { text: "페이지 2 내용" }],
        }),
      };
      const MockPDFParse = jest.fn().mockImplementation(() => mockParser);

      jest.spyOn(service as any, "loadPdfParse").mockResolvedValue(MockPDFParse);

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "application/pdf", originalName: "doc.pdf" }),
      );
      mockFetchResponse(PDF_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("## 페이지 1");
      expect(result.content).toContain("페이지 1 내용");
      expect(result.content).toContain("## 페이지 2");
      expect(result.content).toContain("페이지 2 내용");
      expect(result.metadata).toEqual({ pageCount: 2 });
    });

    it("pages가 비어있으면 전체 텍스트를 fallback으로 사용한다", async () => {
      const mockParser = {
        getText: jest.fn().mockResolvedValue({
          text: "fallback 텍스트",
          pages: [],
        }),
      };
      const MockPDFParse = jest.fn().mockImplementation(() => mockParser);

      jest.spyOn(service as any, "loadPdfParse").mockResolvedValue(MockPDFParse);

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "application/pdf", originalName: "doc.pdf" }),
      );
      mockFetchResponse(PDF_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toBe("fallback 텍스트");
      expect(result.metadata).toEqual({ pageCount: 0 });
    });

    it("pages가 undefined이면 전체 텍스트를 fallback으로 사용한다", async () => {
      const mockParser = {
        getText: jest.fn().mockResolvedValue({
          text: "텍스트만",
        }),
      };
      const MockPDFParse = jest.fn().mockImplementation(() => mockParser);

      jest.spyOn(service as any, "loadPdfParse").mockResolvedValue(MockPDFParse);

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "application/pdf", originalName: "doc.pdf" }),
      );
      mockFetchResponse(PDF_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toBe("텍스트만");
      expect(result.metadata).toEqual({ pageCount: 0 });
    });

    it("PDF 라이브러리 에러 시 fallback 메시지를 반환한다", async () => {
      jest.spyOn(service as any, "loadPdfParse").mockRejectedValue(new Error("No pdf-parse"));

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({ mimeType: "application/pdf", originalName: "doc.pdf" }),
      );
      mockFetchResponse(PDF_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toBe("[PDF 파싱 라이브러리가 설치되지 않았습니다]");
      expect(result.metadata).toEqual({ pageCount: 0 });
    });
  });

  // =========================================================================
  // parseDocx — actual logic via loadJSZip spy
  // =========================================================================
  describe("parseDocx — actual logic", () => {
    function createMockZip(files: Record<string, string | null>) {
      return {
        loadAsync: jest.fn().mockResolvedValue({
          file: (path: string) => {
            const content = files[path];
            if (content === undefined || content === null) return null;
            return { async: jest.fn().mockResolvedValue(content) };
          },
          files: Object.fromEntries(
            Object.entries(files)
              .filter(([, v]) => v !== null)
              .map(([k]) => [k, {}]),
          ),
        }),
      };
    }

    it("DOCX document.xml에서 단락을 추출하고 heading을 마크다운으로 변환한다", async () => {
      const docXml = `<w:document><w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>제목</w:t></w:r></w:p>
        <w:p><w:r><w:t>본문 내용입니다</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>소제목</w:t></w:r></w:p>
      </w:body></w:document>`;

      const mockJSZip = createMockZip({
        "word/document.xml": docXml,
      });

      jest.spyOn(service as any, "loadJSZip").mockResolvedValue(mockJSZip);

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          originalName: "doc.docx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("# 제목");
      expect(result.content).toContain("본문 내용입니다");
      expect(result.content).toContain("## 소제목");
      expect(result.metadata).toEqual({ pageCount: 3 });
    });

    it("document.xml이 없으면 에러 메시지를 반환한다", async () => {
      const mockJSZip = createMockZip({});

      jest.spyOn(service as any, "loadJSZip").mockResolvedValue(mockJSZip);

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          originalName: "broken.docx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("DOCX 파싱 실패: document.xml을 찾을 수 없습니다");
    });

    it("styles.xml에서 추가 heading 스타일을 추출한다", async () => {
      const docXml = `<w:document><w:body>
        <w:p><w:pPr><w:pStyle w:val="CustomHeading3"/></w:pPr><w:r><w:t>커스텀 헤딩</w:t></w:r></w:p>
        <w:p><w:r><w:t>본문</w:t></w:r></w:p>
      </w:body></w:document>`;

      const stylesXml = `<w:styles>
        <w:style w:type="paragraph" w:styleId="CustomHeading3">
          <w:name w:val="heading 3"/>
        </w:style>
      </w:styles>`;

      const mockJSZip = createMockZip({
        "word/document.xml": docXml,
        "word/styles.xml": stylesXml,
      });

      jest.spyOn(service as any, "loadJSZip").mockResolvedValue(mockJSZip);

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          originalName: "styled.docx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      // CustomHeading3 → level 3 → ###
      expect(result.content).toContain("### 커스텀 헤딩");
      expect(result.content).toContain("본문");
    });

    it("내용이 비어있으면 빈 콘텐츠 메시지를 반환한다", async () => {
      const docXml = `<w:document><w:body>
        <w:p></w:p>
      </w:body></w:document>`;

      const mockJSZip = createMockZip({
        "word/document.xml": docXml,
      });

      jest.spyOn(service as any, "loadJSZip").mockResolvedValue(mockJSZip);

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          originalName: "empty.docx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toBe("[DOCX: 내용 없음]");
    });

    it("JSZip 로딩 에러 시 에러 메시지를 반환한다", async () => {
      jest.spyOn(service as any, "loadJSZip").mockRejectedValue(new Error("No jszip"));

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          originalName: "bad.docx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("DOCX 파싱 실패: No jszip");
    });
  });

  // =========================================================================
  // parsePptx — actual logic via loadJSZip spy
  // =========================================================================
  describe("parsePptx — actual logic", () => {
    function createMockPptxZip(slides: Array<{ xml: string; notes?: string }>) {
      const filesObj: Record<string, Record<string, never>> = {};
      const fileContents: Record<string, string> = {};

      slides.forEach((slide, i) => {
        const slidePath = `ppt/slides/slide${i + 1}.xml`;
        filesObj[slidePath] = {};
        fileContents[slidePath] = slide.xml;

        if (slide.notes) {
          const notePath = `ppt/notesSlides/notesSlide${i + 1}.xml`;
          filesObj[notePath] = {};
          fileContents[notePath] = slide.notes;
        }
      });

      return {
        loadAsync: jest.fn().mockResolvedValue({
          files: filesObj,
          file: (path: string) => {
            const content = fileContents[path];
            if (content === undefined) return null;
            return { async: jest.fn().mockResolvedValue(content) };
          },
        }),
      };
    }

    it("PPTX 슬라이드에서 텍스트를 추출한다", async () => {
      const slideXml = `<p:sld>
        <a:p><a:r><a:t>슬라이드 제목</a:t></a:r></a:p>
        <a:p><a:r><a:t>슬라이드 내용</a:t></a:r></a:p>
      </p:sld>`;

      const mockJSZip = createMockPptxZip([{ xml: slideXml }]);
      jest.spyOn(service as any, "loadJSZip").mockResolvedValue(mockJSZip);

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          originalName: "slides.pptx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("## 슬라이드 1");
      expect(result.content).toContain("슬라이드 제목");
      expect(result.content).toContain("슬라이드 내용");
      expect(result.metadata).toEqual({ slideCount: 1 });
    });

    it("여러 슬라이드를 순서대로 추출한다", async () => {
      const mockJSZip = createMockPptxZip([
        { xml: `<p:sld><a:p><a:r><a:t>첫번째</a:t></a:r></a:p></p:sld>` },
        { xml: `<p:sld><a:p><a:r><a:t>두번째</a:t></a:r></a:p></p:sld>` },
        { xml: `<p:sld><a:p><a:r><a:t>세번째</a:t></a:r></a:p></p:sld>` },
      ]);
      jest.spyOn(service as any, "loadJSZip").mockResolvedValue(mockJSZip);

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          originalName: "multi.pptx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("## 슬라이드 1");
      expect(result.content).toContain("첫번째");
      expect(result.content).toContain("## 슬라이드 2");
      expect(result.content).toContain("두번째");
      expect(result.content).toContain("## 슬라이드 3");
      expect(result.content).toContain("세번째");
      expect(result.metadata).toEqual({ slideCount: 3 });
    });

    it("발표자 노트가 있으면 함께 포함한다", async () => {
      const slideXml = `<p:sld><a:p><a:r><a:t>슬라이드 내용</a:t></a:r></a:p></p:sld>`;
      const noteXml = `<p:notes><a:p><a:r><a:t>이것은 발표자 노트입니다</a:t></a:r></a:p></p:notes>`;

      const mockJSZip = createMockPptxZip([{ xml: slideXml, notes: noteXml }]);
      jest.spyOn(service as any, "loadJSZip").mockResolvedValue(mockJSZip);

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          originalName: "notes.pptx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("발표자 노트");
      expect(result.content).toContain("이것은 발표자 노트입니다");
    });

    it("빈 슬라이드는 (내용 없음)으로 표시한다", async () => {
      const emptySlideXml = `<p:sld></p:sld>`;

      const mockJSZip = createMockPptxZip([{ xml: emptySlideXml }]);
      jest.spyOn(service as any, "loadJSZip").mockResolvedValue(mockJSZip);

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          originalName: "empty.pptx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("(내용 없음)");
    });

    it("JSZip 로딩 에러 시 에러 메시지를 반환한다", async () => {
      jest.spyOn(service as any, "loadJSZip").mockRejectedValue(new Error("No jszip"));

      mockDb.query.agentDeskFiles.findFirst.mockResolvedValue(
        createMockFile({
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          originalName: "bad.pptx",
        }),
      );
      mockFetchResponse(ZIP_MAGIC);
      mockDb._queueUpdateResolve(undefined);

      const result = await service.parseFile(mockFileId);

      expect(result.content).toContain("PPTX 파싱 실패: No jszip");
    });
  });

  // =========================================================================
  // extractTextFromXml — fallback path
  // =========================================================================
  describe("extractTextFromXml — fallback", () => {
    it("<a:p> 없이 <a:t>만 있으면 fallback으로 모든 텍스트를 추출한다", () => {
      // No <a:p> wrapper, just bare <a:t> elements
      const xml = `<root><a:t>텍스트1</a:t><a:t>텍스트2</a:t></root>`;

      const result = (service as any).extractTextFromXml(xml);

      expect(result).toBe("텍스트1 텍스트2");
    });
  });

  // =========================================================================
  // detectMimeFromMagicBytes (direct unit tests)
  // =========================================================================
  describe("detectMimeFromMagicBytes", () => {
    it("PDF magic bytes를 감지한다", () => {
      const result = (service as any).detectMimeFromMagicBytes(PDF_MAGIC);
      expect(result).toBe("application/pdf");
    });

    it("ZIP magic bytes를 감지한다", () => {
      const result = (service as any).detectMimeFromMagicBytes(ZIP_MAGIC);
      expect(result).toBe("application/zip");
    });

    it("PNG magic bytes를 감지한다", () => {
      const result = (service as any).detectMimeFromMagicBytes(PNG_MAGIC);
      expect(result).toBe("image/png");
    });

    it("JPEG magic bytes를 감지한다", () => {
      const result = (service as any).detectMimeFromMagicBytes(JPEG_MAGIC);
      expect(result).toBe("image/jpeg");
    });

    it("GIF magic bytes를 감지한다", () => {
      const gifMagic = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      const result = (service as any).detectMimeFromMagicBytes(gifMagic);
      expect(result).toBe("image/gif");
    });

    it("WebP magic bytes를 감지한다", () => {
      const webpMagic = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      const result = (service as any).detectMimeFromMagicBytes(webpMagic);
      expect(result).toBe("image/webp");
    });

    it("알 수 없는 magic bytes는 null을 반환한다", () => {
      const unknownMagic = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const result = (service as any).detectMimeFromMagicBytes(unknownMagic);
      expect(result).toBeNull();
    });
  });
});
