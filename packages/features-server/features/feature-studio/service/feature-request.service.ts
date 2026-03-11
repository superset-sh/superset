import { Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import {
  InjectDrizzle,
  type DrizzleDB,
  featureRequestArtifacts,
  featureRequestApprovals,
  featureRequestMessages,
  featureRequests,
  featureRequestWorktrees,
} from "@superbuilder/drizzle";
import type {
  AppendFeatureRequestMessageDto,
  CreateFeatureRequestDto,
} from "../dto";

@Injectable()
export class FeatureRequestService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async createRequest(input: CreateFeatureRequestDto, userId: string) {
    const [created] = await this.db
      .insert(featureRequests)
      .values({
        title: input.title,
        rawPrompt: input.rawPrompt,
        summary: input.summary ?? null,
        rulesetReference: input.rulesetReference ?? null,
        createdById: userId,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create feature request");
    }

    return created;
  }

  async getRequest(id: string) {
    const request = await this.db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, id),
      with: {
        messages: {
          orderBy: [desc(featureRequestMessages.createdAt)],
        },
        approvals: {
          orderBy: [desc(featureRequestApprovals.createdAt)],
        },
        artifacts: {
          orderBy: [desc(featureRequestArtifacts.createdAt)],
        },
        worktrees: {
          orderBy: [desc(featureRequestWorktrees.createdAt)],
        },
      },
    });

    if (!request) {
      throw new NotFoundException(`Feature request not found: ${id}`);
    }

    return request;
  }

  async listRequests(input?: { status?: (typeof featureRequests.$inferSelect)["status"] }) {
    return this.db.query.featureRequests.findMany({
      where: input?.status ? eq(featureRequests.status, input.status) : undefined,
      orderBy: [desc(featureRequests.createdAt)],
    });
  }

  async listApprovals() {
    return this.db.query.featureRequestApprovals.findMany({
      orderBy: [desc(featureRequestApprovals.createdAt)],
    });
  }

  async listQueue(input?: { status?: (typeof featureRequests.$inferSelect)["status"] }) {
    const [requests, approvals] = await Promise.all([
      this.listRequests(input),
      this.listApprovals(),
    ]);

    return {
      requests,
      pendingApprovals: approvals.filter((approval) => approval.status === "pending"),
    };
  }

  async appendMessage(input: AppendFeatureRequestMessageDto) {
    await this.ensureRequestExists(input.featureRequestId);

    const [created] = await this.db
      .insert(featureRequestMessages)
      .values({
        featureRequestId: input.featureRequestId,
        role: input.role,
        kind: input.kind ?? "conversation",
        content: input.content,
        metadata: input.metadata ?? null,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to append feature request message");
    }

    return created;
  }

  async respondToApproval(input: {
    approvalId: string;
    action: "approved" | "rejected" | "discarded";
    feedback?: string;
    decidedById: string;
  }) {
    const approval = await this.db.query.featureRequestApprovals.findFirst({
      where: eq(featureRequestApprovals.id, input.approvalId),
    });

    if (!approval) {
      throw new NotFoundException(`Approval not found: ${input.approvalId}`);
    }

    const [updated] = await this.db
      .update(featureRequestApprovals)
      .set({
        status: input.action,
        decisionNotes: input.feedback ?? null,
        decidedById: input.decidedById,
      })
      .where(eq(featureRequestApprovals.id, input.approvalId))
      .returning();

    if (!updated) {
      throw new Error("Failed to update approval");
    }

    if (approval.approvalType === "human_qa" && input.feedback?.trim()) {
      await this.db.insert(featureRequestArtifacts).values({
        featureRequestId: approval.featureRequestId,
        kind: "human_qa_notes",
        version: 1,
        content: input.feedback.trim(),
        metadata: {
          approvalId: approval.id,
          action: input.action,
        },
        createdById: input.decidedById,
      });
    }

    const nextStatus = this.resolveApprovalStatus({
      approvalType: approval.approvalType,
      action: input.action,
    });

    if (nextStatus) {
      await this.db
        .update(featureRequests)
        .set({
          status: nextStatus,
        })
        .where(eq(featureRequests.id, approval.featureRequestId));
    }

    return updated;
  }

  private resolveApprovalStatus(input: {
    approvalType: (typeof featureRequestApprovals.$inferSelect)["approvalType"];
    action: "approved" | "rejected" | "discarded";
  }): (typeof featureRequests.$inferSelect)["status"] | null {
    if (input.action === "discarded") {
      return "discarded";
    }

    if (
      input.action === "rejected" &&
      (input.approvalType === "human_qa" ||
        input.approvalType === "registration")
    ) {
      return "customization";
    }

    return null;
  }

  private async ensureRequestExists(featureRequestId: string) {
    const request = await this.db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, featureRequestId),
      columns: { id: true },
    });

    if (!request) {
      throw new NotFoundException(
        `Feature request not found: ${featureRequestId}`,
      );
    }

    return request;
  }
}
