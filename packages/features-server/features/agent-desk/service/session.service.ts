import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { and, desc, eq, sum } from "drizzle-orm";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { agentDeskSessions, agentDeskFiles, agentDeskMessages, agentDeskExecutions } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import type { CreateSessionDto } from "../dto/create-session.dto";
import type { ConfirmUploadDto } from "../dto/upload-file.dto";
import type { SessionStatus } from "../types";

const logger = createLogger("agent-desk");

@Injectable()
export class SessionService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async create(input: CreateSessionDto, userId: string) {
    const isDesigner = input.type === "designer";

    const [session] = await this.db
      .insert(agentDeskSessions)
      .values({
        type: input.type,
        title: input.title,
        prompt: input.prompt,
        createdById: userId,
        ...(isDesigner && {
          status: "designing" as const,
          platform: input.platform,
          designTheme: input.designTheme,
          flowData: { screens: [], currentScreenIndex: 0 },
        }),
      })
      .returning();

    if (!session) throw new BadRequestException("Failed to create session");

    logger.info("Session created", {
      "agent_desk.session_id": session.id,
      "agent_desk.type": input.type,
      "user.id": userId,
    });

    return session;
  }

  async findById(id: string) {
    const session = await this.db.query.agentDeskSessions.findFirst({
      where: eq(agentDeskSessions.id, id),
    });
    if (!session) throw new NotFoundException(`Session not found: ${id}`);
    return session;
  }

  async verifySessionOwnership(sessionId: string, userId: string) {
    const session = await this.findById(sessionId);
    if (session.createdById !== userId) {
      throw new ForbiddenException(`Not authorized to access session: ${sessionId}`);
    }
    return session;
  }

  async findByIdWithRelations(id: string) {
    const session = await this.findById(id);
    const [files, messages] = await Promise.all([
      this.db.query.agentDeskFiles.findMany({
        where: eq(agentDeskFiles.sessionId, id),
        orderBy: [desc(agentDeskFiles.createdAt)],
      }),
      this.db.query.agentDeskMessages.findMany({
        where: eq(agentDeskMessages.sessionId, id),
        orderBy: [agentDeskMessages.createdAt],
      }),
    ]);
    return { ...session, files, messages };
  }

  async listByUser(userId: string, type?: "customer" | "operator" | "designer") {
    const conditions = [eq(agentDeskSessions.createdById, userId)];
    if (type) conditions.push(eq(agentDeskSessions.type, type));

    return this.db.query.agentDeskSessions.findMany({
      where: and(...conditions),
      orderBy: [desc(agentDeskSessions.updatedAt)],
    });
  }

  async updateStatus(id: string, status: SessionStatus) {
    await this.findById(id);
    const [updated] = await this.db
      .update(agentDeskSessions)
      .set({ status })
      .where(eq(agentDeskSessions.id, id))
      .returning();

    if (!updated) throw new BadRequestException("Failed to update session status");

    logger.info("Session status updated", {
      "agent_desk.session_id": id,
      "agent_desk.status": status,
    });

    return updated;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.db.delete(agentDeskSessions).where(eq(agentDeskSessions.id, id));
    logger.info("Session deleted", { "agent_desk.session_id": id });
    return { success: true };
  }

  async getTotalFileSize(sessionId: string): Promise<number> {
    const result = await this.db
      .select({ total: sum(agentDeskFiles.size) })
      .from(agentDeskFiles)
      .where(eq(agentDeskFiles.sessionId, sessionId));
    return Number(result[0]?.total ?? 0);
  }

  async addFile(input: ConfirmUploadDto) {
    // 세션당 200MB 합계 검증
    const MAX_SESSION_SIZE = 200 * 1024 * 1024; // 200MB
    const totalSize = await this.getTotalFileSize(input.sessionId);
    if (totalSize + input.size > MAX_SESSION_SIZE) {
      throw new BadRequestException(
        `세션당 파일 용량 200MB를 초과합니다. (현재: ${Math.round(totalSize / 1024 / 1024)}MB, 추가: ${Math.round(input.size / 1024 / 1024)}MB)`,
      );
    }

    const [file] = await this.db
      .insert(agentDeskFiles)
      .values({
        sessionId: input.sessionId,
        fileName: input.fileName,
        originalName: input.originalName,
        mimeType: input.mimeType,
        size: input.size,
        storageUrl: input.storageUrl,
      })
      .returning();

    if (!file) throw new BadRequestException("Failed to add file");

    logger.info("File added to session", {
      "agent_desk.session_id": input.sessionId,
      "agent_desk.file_id": file.id,
      "agent_desk.file_name": input.originalName,
    });

    return file;
  }

  async removeFile(fileId: string) {
    await this.db.delete(agentDeskFiles).where(eq(agentDeskFiles.id, fileId));
    logger.info("File removed from session", { "agent_desk.file_id": fileId });
    return { success: true };
  }

  async getFiles(sessionId: string) {
    return this.db.query.agentDeskFiles.findMany({
      where: eq(agentDeskFiles.sessionId, sessionId),
      orderBy: [desc(agentDeskFiles.createdAt)],
    });
  }

  async addMessage(sessionId: string, role: "agent" | "user", content: string) {
    const [message] = await this.db
      .insert(agentDeskMessages)
      .values({ sessionId, role, content })
      .returning();
    if (!message) throw new BadRequestException("Failed to add message");
    return message;
  }

  async getMessages(sessionId: string) {
    return this.db.query.agentDeskMessages.findMany({
      where: eq(agentDeskMessages.sessionId, sessionId),
      orderBy: [agentDeskMessages.createdAt],
    });
  }

  async updateMessageFeedback(messageId: string, feedback: "like" | "dislike" | null) {
    const [updated] = await this.db
      .update(agentDeskMessages)
      .set({ feedback, feedbackAt: feedback ? new Date() : null })
      .where(eq(agentDeskMessages.id, messageId))
      .returning();
    if (!updated) throw new NotFoundException(`Message not found: ${messageId}`);
    return updated;
  }

  async getMessageWithSession(messageId: string) {
    const message = await this.db.query.agentDeskMessages.findFirst({
      where: eq(agentDeskMessages.id, messageId),
    });
    if (!message) throw new NotFoundException(`Message not found: ${messageId}`);
    return message;
  }

  async getLatestExecution(sessionId: string) {
    const execution = await this.db.query.agentDeskExecutions.findFirst({
      where: eq(agentDeskExecutions.sessionId, sessionId),
      orderBy: [desc(agentDeskExecutions.startedAt)],
    });
    return execution ?? null;
  }
}
