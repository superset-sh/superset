import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskFiles } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import { LLMService } from "../../../features/ai";
import type { ParsedFileResult } from "../types";

const logger = createLogger("agent-desk");

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/markdown",
  "text/plain",
]);

@Injectable()
export class FileParserService {
  private readonly supabaseUrl: string;
  private readonly supabaseKey: string;

  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly llmService: LLMService,
    private readonly configService: ConfigService,
  ) {
    this.supabaseUrl = this.configService.get<string>("SUPABASE_URL") ?? "";
    this.supabaseKey = this.configService.get<string>("SUPABASE_SECRET_KEY") ?? "";
  }

  async parseFile(fileId: string): Promise<ParsedFileResult> {
    const file = await this.db.query.agentDeskFiles.findFirst({
      where: eq(agentDeskFiles.id, fileId),
    });
    if (!file) throw new NotFoundException(`File not found: ${fileId}`);

    let content = "";
    let metadata: ParsedFileResult["metadata"] = {};

    try {
      const downloadUrl = this.resolveStorageUrl(file.storageUrl);
      const headers: Record<string, string> = {};
      if (downloadUrl.includes(this.supabaseUrl) && this.supabaseKey) {
        headers["Authorization"] = `Bearer ${this.supabaseKey}`;
        headers["apikey"] = this.supabaseKey;
      }
      const response = await fetch(downloadUrl, { headers });
      if (!response.ok) {
        throw new Error(`Storage download failed: ${response.status} ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      // Magic bytes 검증
      this.validateMagicBytes(buffer, file.mimeType, file.originalName);

      if (file.mimeType === "application/pdf") {
        const result = await this.parsePdf(buffer);
        content = result.content;
        metadata = { pageCount: result.pageCount };
      } else if (
        file.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      ) {
        const result = await this.parsePptx(buffer);
        content = result.content;
        metadata = { slideCount: result.slideCount };
      } else if (
        file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        || file.mimeType === "application/msword"
        || file.originalName.endsWith(".docx")
        || file.originalName.endsWith(".doc")
      ) {
        const result = await this.parseDocx(buffer);
        content = result.content;
        metadata = { pageCount: result.paragraphCount };
      } else if (file.mimeType.startsWith("image/")) {
        const result = await this.parseImage(buffer, file.mimeType, file.originalName);
        content = result.content;
        metadata = { imageDescription: result.content };
      } else if (
        file.mimeType === "text/markdown" ||
        file.mimeType === "text/plain" ||
        file.originalName.endsWith(".md") ||
        file.originalName.endsWith(".txt")
      ) {
        content = this.parseText(buffer, file.originalName);
      } else {
        content = buffer.toString("utf-8");
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("File parsing failed", {
        "agent_desk.file_id": fileId,
        "agent_desk.file_name": file.originalName,
        "error.message": errMsg,
      });
      content = `[파일 파싱 실패: ${file.originalName}] ${errMsg}`;
    }

    await this.db
      .update(agentDeskFiles)
      .set({ parsedContent: content, parsedAt: new Date() })
      .where(eq(agentDeskFiles.id, fileId));

    logger.info("File parsed", {
      "agent_desk.file_id": fileId,
      "agent_desk.file_name": file.originalName,
      "agent_desk.content_length": content.length,
    });

    return { fileId, fileName: file.originalName, mimeType: file.mimeType, content, metadata };
  }

  /**
   * Magic bytes 검증 — 클라이언트가 보낸 MIME과 실제 파일 타입 비교
   */
  private validateMagicBytes(buffer: Buffer, claimedMime: string, fileName: string): void {
    // 텍스트 파일은 magic bytes가 없으므로 스킵
    if (claimedMime === "text/plain" || claimedMime === "text/markdown") return;
    if (buffer.length < 4) return;

    const detectedMime = this.detectMimeFromMagicBytes(buffer);
    if (!detectedMime) return;

    // PPTX/DOCX와 ZIP은 동일한 magic bytes (PK)
    const isOfficeXml = detectedMime === "application/zip" && (
      claimedMime === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      || claimedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    const normalizedDetected = isOfficeXml ? claimedMime : detectedMime;

    if (normalizedDetected !== claimedMime) {
      logger.warn("MIME type mismatch", {
        "agent_desk.file_name": fileName,
        "agent_desk.claimed_mime": claimedMime,
        "agent_desk.detected_mime": detectedMime,
      });

      if (!ALLOWED_MIME_TYPES.has(detectedMime) && detectedMime !== "application/zip") {
        throw new BadRequestException(
          `파일 타입 불일치: 선언된 타입(${claimedMime})과 실제 타입(${detectedMime})이 다릅니다.`,
        );
      }
    }
  }

  /**
   * Magic bytes로 MIME 타입 감지 (CJS 호환 — file-type 패키지 대체)
   */
  private detectMimeFromMagicBytes(buffer: Buffer): string | null {
    // PDF: %PDF
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return "application/pdf";
    }
    // ZIP/PPTX: PK\x03\x04
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return "application/zip";
    }
    // PNG: \x89PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return "image/png";
    }
    // JPEG: \xFF\xD8\xFF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }
    // GIF: GIF8
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return "image/gif";
    }
    // WebP: RIFF....WEBP
    if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
      && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return "image/webp";
    }
    return null;
  }

  /**
   * PDF 파싱 — pdf-parse로 텍스트 추출
   */
  private async parsePdf(buffer: Buffer): Promise<{ content: string; pageCount: number }> {
    try {
      const PDFParse = await this.loadPdfParse();
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();

      const pages = textResult.pages ?? [];
      const formatted = pages
        .map((page, i) => `## 페이지 ${i + 1}\n\n${page.text.trim()}`)
        .join("\n\n---\n\n");

      return { content: formatted || textResult.text, pageCount: pages.length };
    } catch {
      return { content: "[PDF 파싱 라이브러리가 설치되지 않았습니다]", pageCount: 0 };
    }
  }

  /**
   * DOCX 파싱 — jszip으로 word/document.xml에서 텍스트 추출
   */
  private async parseDocx(buffer: Buffer): Promise<{ content: string; paragraphCount: number }> {
    try {
      const JSZip = await this.loadJSZip();
      const zip = await JSZip.loadAsync(buffer);

      const docFile = zip.file("word/document.xml");
      if (!docFile) {
        return { content: "[DOCX 파싱 실패: document.xml을 찾을 수 없습니다]", paragraphCount: 0 };
      }

      const docXml = await docFile.async("text");
      const paragraphs = this.extractDocxParagraphs(docXml);

      // 기본 heading 스타일 ID
      const headingStyleIds = new Set<string>();
      for (let i = 1; i <= 9; i++) {
        headingStyleIds.add(`Heading${i}`);
        headingStyleIds.add(`heading${i}`);
      }

      // 스타일 파일에서 추가 heading 스타일 추출
      const stylesFile = zip.file("word/styles.xml");
      if (stylesFile) {
        const stylesXml = await stylesFile.async("text");
        const headingRegex = /<w:style[^>]*w:styleId="([^"]*)"[^>]*>[^]*?<w:name[^>]*w:val="heading[^"]*"[^/]*\/>/gi;
        let styleMatch: RegExpExecArray | null;
        while ((styleMatch = headingRegex.exec(stylesXml)) !== null) {
          headingStyleIds.add(styleMatch[1]!);
        }
      }

      const formatted = paragraphs
        .filter((p) => p.text.trim())
        .map((p) => {
          if (headingStyleIds.has(p.styleId)) {
            const level = parseInt(p.styleId.replace(/\D/g, "")) || 2;
            return `${"#".repeat(Math.min(level, 6))} ${p.text.trim()}`;
          }
          return p.text.trim();
        })
        .join("\n\n");

      return {
        content: formatted || "[DOCX: 내용 없음]",
        paragraphCount: paragraphs.filter((p) => p.text.trim()).length,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("DOCX parsing failed", { "error.message": errMsg });
      return { content: `[DOCX 파싱 실패: ${errMsg}]`, paragraphCount: 0 };
    }
  }

  /**
   * DOCX XML에서 단락 및 스타일 추출
   */
  private extractDocxParagraphs(xml: string): Array<{ text: string; styleId: string }> {
    const paragraphRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
    const results: Array<{ text: string; styleId: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = paragraphRegex.exec(xml)) !== null) {
      const paraContent = match[1]!;
      const styleMatch = paraContent.match(/<w:pStyle[^>]*w:val="([^"]*)"/);
      const styleId = styleMatch?.[1] ?? "";

      const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      const texts: string[] = [];
      let textMatch: RegExpExecArray | null;
      while ((textMatch = textRegex.exec(paraContent)) !== null) {
        const decoded = textMatch[1]!
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        texts.push(decoded);
      }

      results.push({ text: texts.join(""), styleId });
    }

    return results;
  }

  /**
   * PPTX 파싱 — jszip으로 슬라이드 XML에서 텍스트/노트 추출
   */
  private async parsePptx(buffer: Buffer): Promise<{ content: string; slideCount: number }> {
    try {
      const JSZip = await this.loadJSZip();
      const zip = await JSZip.loadAsync(buffer);

      const slideFiles = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? "0");
          const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? "0");
          return numA - numB;
        });

      const slides: string[] = [];

      for (let i = 0; i < slideFiles.length; i++) {
        const slideXml = await zip.file(slideFiles[i]!)!.async("text");
        const slideText = this.extractTextFromXml(slideXml);

        // 노트 파일 확인
        const noteFile = `ppt/notesSlides/notesSlide${i + 1}.xml`;
        let noteText = "";
        if (zip.files[noteFile]) {
          const noteXml = await zip.file(noteFile)!.async("text");
          noteText = this.extractTextFromXml(noteXml);
        }

        let slideContent = `## 슬라이드 ${i + 1}\n\n${slideText.trim() || "(내용 없음)"}`;
        if (noteText.trim()) {
          slideContent += `\n\n> **발표자 노트**: ${noteText.trim()}`;
        }
        slides.push(slideContent);
      }

      return {
        content: slides.join("\n\n---\n\n"),
        slideCount: slideFiles.length,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("PPTX parsing failed", { "error.message": errMsg });
      return { content: `[PPTX 파싱 실패: ${errMsg}]`, slideCount: 0 };
    }
  }

  /**
   * XML에서 단락 단위로 텍스트 추출
   */
  private extractTextFromXml(xml: string): string {
    const paragraphRegex = /<a:p[^>]*>([\s\S]*?)<\/a:p>/g;
    const paragraphs: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = paragraphRegex.exec(xml)) !== null) {
      const innerTexts: string[] = [];
      const innerRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
      let innerMatch: RegExpExecArray | null;
      while ((innerMatch = innerRegex.exec(match[1]!)) !== null) {
        const decoded = innerMatch[1]!
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        innerTexts.push(decoded);
      }
      if (innerTexts.length > 0) {
        paragraphs.push(innerTexts.join(""));
      }
    }

    if (paragraphs.length > 0) return paragraphs.join("\n");

    // fallback: 단락 구분 없이 모든 <a:t> 추출
    const textRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
    const texts: string[] = [];
    while ((match = textRegex.exec(xml)) !== null) {
      texts.push(match[1]!);
    }
    return texts.join(" ");
  }

  /**
   * 이미지 파싱 — LLM 멀티모달 Vision API로 설명 생성
   */
  private async parseImage(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<{ content: string }> {
    try {
      const base64 = buffer.toString("base64");
      const description = await this.llmService.describeImage(base64, mimeType);
      return { content: `## 이미지: ${fileName}\n\n${description}` };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn("Image LLM analysis failed, using fallback", {
        "agent_desk.file_name": fileName,
        "error.message": errMsg,
      });
      return { content: `[이미지 파일: ${fileName}] (LLM 분석 실패: ${errMsg})` };
    }
  }

  /**
   * 텍스트/마크다운 파싱 — UTF-8 변환, 프론트매터 제거
   */
  /** Extracted for testability — dynamic import can't be mocked in Jest VM. */
  protected async loadPdfParse() {
    const { PDFParse } = await import("pdf-parse");
    return PDFParse;
  }

  /** Extracted for testability — dynamic import can't be mocked in Jest VM. */
  protected async loadJSZip() {
    const JSZip = (await import("jszip")).default;
    return JSZip;
  }

  /**
   * storage:// URL을 실제 Supabase Storage download URL로 변환
   */
  private resolveStorageUrl(storageUrl: string): string {
    if (!storageUrl.startsWith("storage://")) return storageUrl;

    // storage://files/agent-desk/.../file.pptx → bucket=files, path=agent-desk/.../file.pptx
    const withoutProtocol = storageUrl.slice("storage://".length);
    const slashIndex = withoutProtocol.indexOf("/");
    if (slashIndex === -1) return storageUrl;

    const bucket = withoutProtocol.slice(0, slashIndex);
    const path = withoutProtocol.slice(slashIndex + 1);

    return `${this.supabaseUrl}/storage/v1/object/${bucket}/${path}`;
  }

  private parseText(buffer: Buffer, fileName: string): string {
    let text = buffer.toString("utf-8");

    // 마크다운 프론트매터 제거
    if (fileName.endsWith(".md") && text.startsWith("---")) {
      const endIndex = text.indexOf("---", 3);
      if (endIndex !== -1) {
        text = text.slice(endIndex + 3).trim();
      }
    }

    return text;
  }
}
