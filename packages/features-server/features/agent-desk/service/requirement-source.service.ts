import { Injectable, BadRequestException } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskRequirementSources } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import type { AddRequirementSourceDto } from "../dto/requirement-source.dto";
import { SessionService } from "./session.service";
import { FileParserService } from "./file-parser.service";

const logger = createLogger("agent-desk");

@Injectable()
export class RequirementSourceService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly sessionService: SessionService,
    private readonly fileParserService: FileParserService,
  ) {}

  async addSource(input: AddRequirementSourceDto, userId: string) {
    await this.sessionService.verifySessionOwnership(input.sessionId, userId);

    // Validation: manual 타입은 rawContent 필수, 파일 타입은 fileId 필수
    if (input.sourceType === "manual") {
      if (!input.rawContent) {
        throw new BadRequestException("manual 소스 유형에는 rawContent가 필수입니다");
      }
    } else {
      if (!input.fileId) {
        throw new BadRequestException(`${input.sourceType} 소스 유형에는 fileId가 필수입니다`);
      }
    }

    const isManual = input.sourceType === "manual";

    const [source] = await this.db
      .insert(agentDeskRequirementSources)
      .values({
        sessionId: input.sessionId,
        sourceType: input.sourceType,
        title: input.title,
        rawContent: input.rawContent ?? null,
        fileId: input.fileId ?? null,
        parseStatus: isManual ? "parsed" : "pending",
        parsedContent: isManual ? input.rawContent! : null,
      })
      .returning();

    if (!source) throw new BadRequestException("Failed to add requirement source");

    logger.info("Requirement source added", {
      "agent_desk.source_id": source.id,
      "agent_desk.session_id": input.sessionId,
      "agent_desk.source_type": input.sourceType,
    });

    // 파일 소스는 비동기 파싱 트리거
    if (!isManual && input.fileId) {
      this.triggerParsing(source.id, input.fileId).catch((error) => {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error("Requirement source parsing failed", {
          "agent_desk.source_id": source.id,
          "agent_desk.file_id": input.fileId!,
          "error.message": errMsg,
        });
      });
    }

    return source;
  }

  async listSources(sessionId: string, userId: string) {
    await this.sessionService.verifySessionOwnership(sessionId, userId);

    return this.db.query.agentDeskRequirementSources.findMany({
      where: eq(agentDeskRequirementSources.sessionId, sessionId),
      orderBy: [desc(agentDeskRequirementSources.createdAt)],
    });
  }

  private async triggerParsing(sourceId: string, fileId: string) {
    const result = await this.fileParserService.parseFile(fileId);

    await this.db
      .update(agentDeskRequirementSources)
      .set({
        parsedContent: result.content,
        parseStatus: "parsed",
        metadata: result.metadata,
      })
      .where(eq(agentDeskRequirementSources.id, sourceId));

    logger.info("Requirement source parsed", {
      "agent_desk.source_id": sourceId,
      "agent_desk.file_id": fileId,
      "agent_desk.content_length": result.content.length,
    });
  }
}
