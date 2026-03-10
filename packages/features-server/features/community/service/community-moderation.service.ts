import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { eq, and, count, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  communityReports,
  communityBans,
  communityRules,
  communityFlairs,
  communityModerators,
  communityModLogs,
  type CommunityReport,
  type CommunityBan,
  type CommunityRule,
  type CommunityFlair,
  type CommunityModerator,
} from "@superbuilder/drizzle";
import type {
  CreateReportDto,
  ResolveReportDto,
  BanUserDto,
  CreateRuleDto,
  CreateFlairDto,
  InviteModeratorDto,
} from "../dto";
import { CommunityService } from "./community.service";
import { assertCommunityPermission } from "../helpers/permission";

@Injectable()
export class CommunityModerationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
    private readonly communityService: CommunityService
  ) {}

  /**
   * 신고 생성
   */
  async createReport(dto: CreateReportDto, userId: string): Promise<CommunityReport> {
    const [report] = await this.db
      .insert(communityReports)
      .values({
        ...dto,
        reporterId: userId,
      })
      .returning();

    // Mod log 기록
    await this.logModAction({
      communityId: dto.communityId,
      moderatorId: userId,
      action: "other",
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: "Report created",
    });

    return report as CommunityReport;
  }

  /**
   * 신고 처리
   */
  async resolveReport(dto: ResolveReportDto, userId: string): Promise<CommunityReport> {
    const report = await this.findReportById(dto.reportId);
    if (!report) {
      throw new NotFoundException("신고를 찾을 수 없습니다.");
    }

    await assertCommunityPermission(this.communityService, userId, report.communityId, ["owner", "admin", "moderator"]);

    const [updated] = await this.db
      .update(communityReports)
      .set({
        status: "resolved",
        actionTaken: dto.action,
        resolution: dto.reason,
        resolvedBy: userId,
        resolvedAt: new Date(),
      })
      .where(eq(communityReports.id, dto.reportId))
      .returning();

    // Mod log 기록
    await this.logModAction({
      communityId: report.communityId,
      moderatorId: userId,
      action: "other",
      targetType: report.targetType,
      targetId: report.targetId,
      reason: `Resolved report: ${dto.action}`,
    });

    return updated as CommunityReport;
  }

  /**
   * 신고 목록 조회
   */
  async getReports(communityId: string, status?: string) {
    let query = this.db
      .select()
      .from(communityReports)
      .where(eq(communityReports.communityId, communityId));

    if (status) {
      query = (query as any).where(
        and(eq(communityReports.communityId, communityId), eq(communityReports.status, status as any))
      );
    }

    const items = await query.orderBy(desc(communityReports.createdAt));
    return items as CommunityReport[];
  }

  /**
   * 신고 ID로 조회
   */
  async findReportById(id: string): Promise<CommunityReport | null> {
    const [result] = await this.db
      .select()
      .from(communityReports)
      .where(eq(communityReports.id, id))
      .limit(1);

    return (result as CommunityReport) ?? null;
  }

  /**
   * Mod Queue 조회
   */
  async getModQueue(communityId: string) {
    const reports = await this.db
      .select()
      .from(communityReports)
      .where(
        and(eq(communityReports.communityId, communityId), eq(communityReports.status, "pending"))
      )
      .orderBy(desc(communityReports.createdAt));

    return {
      reports: reports as CommunityReport[],
      spam: [],
      removed: [],
    };
  }

  /**
   * 사용자 밴
   */
  async banUser(dto: BanUserDto, moderatorId: string): Promise<CommunityBan> {
    await assertCommunityPermission(this.communityService, moderatorId, dto.communityId, ["owner", "admin", "moderator"]);

    // 이미 밴되어 있는지 확인
    const existing = await this.findBan(dto.communityId, dto.userId);
    if (existing) {
      throw new ConflictException("이미 차단된 사용자입니다.");
    }

    const expiresAt = dto.isPermanent
      ? null
      : new Date(Date.now() + (dto.durationDays ?? 0) * 24 * 60 * 60 * 1000);

    const [ban] = await this.db
      .insert(communityBans)
      .values({
        communityId: dto.communityId,
        userId: dto.userId,
        bannedBy: moderatorId,
        reason: dto.reason,
        note: dto.note,
        isPermanent: dto.isPermanent,
        expiresAt,
      })
      .returning();

    // Mod log 기록
    await this.logModAction({
      communityId: dto.communityId,
      moderatorId,
      action: "ban_user",
      targetType: "user",
      targetId: dto.userId,
      reason: dto.reason,
    });

    return ban as CommunityBan;
  }

  /**
   * 밴 해제
   */
  async unbanUser(communityId: string, userId: string, moderatorId: string): Promise<void> {
    await assertCommunityPermission(this.communityService, moderatorId, communityId, ["owner", "admin", "moderator"]);

    await this.db
      .delete(communityBans)
      .where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, userId)));

    // Mod log 기록
    await this.logModAction({
      communityId,
      moderatorId,
      action: "unban_user",
      targetType: "user",
      targetId: userId,
      reason: "User unbanned",
    });
  }

  /**
   * 밴 조회
   */
  async findBan(communityId: string, userId: string): Promise<CommunityBan | null> {
    const [result] = await this.db
      .select()
      .from(communityBans)
      .where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, userId)))
      .limit(1);

    return (result as CommunityBan) ?? null;
  }

  /**
   * 밴된 사용자 목록
   */
  async getBannedUsers(communityId: string): Promise<CommunityBan[]> {
    const items = await this.db
      .select()
      .from(communityBans)
      .where(eq(communityBans.communityId, communityId))
      .orderBy(desc(communityBans.createdAt));

    return items as CommunityBan[];
  }

  /**
   * 규칙 생성
   */
  async createRule(dto: CreateRuleDto, moderatorId: string): Promise<CommunityRule> {
    await assertCommunityPermission(this.communityService, moderatorId, dto.communityId, ["owner", "admin", "moderator"]);

    const [rule] = await this.db
      .insert(communityRules)
      .values({
        communityId: dto.communityId,
        title: dto.title,
        description: dto.description,
        appliesTo: dto.appliesTo,
        violationAction: dto.violationAction,
      })
      .returning();

    // Mod log 기록
    await this.logModAction({
      communityId: dto.communityId,
      moderatorId,
      action: "edit_rules",
      targetType: "community",
      targetId: dto.communityId,
      reason: "Rule created",
    });

    return rule as CommunityRule;
  }

  /**
   * 규칙 목록 조회
   */
  async getRules(communityId: string): Promise<CommunityRule[]> {
    const items = await this.db
      .select()
      .from(communityRules)
      .where(eq(communityRules.communityId, communityId))
      .orderBy(communityRules.displayOrder);

    return items as CommunityRule[];
  }

  /**
   * 플레어 생성
   */
  async createFlair(dto: CreateFlairDto, moderatorId: string): Promise<CommunityFlair> {
    await assertCommunityPermission(this.communityService, moderatorId, dto.communityId, ["owner", "admin", "moderator"]);

    const [flair] = await this.db.insert(communityFlairs).values(dto).returning();

    // Mod log 기록
    await this.logModAction({
      communityId: dto.communityId,
      moderatorId,
      action: "add_flair",
      targetType: "community",
      targetId: dto.communityId,
      reason: "Flair created",
    });

    return flair as CommunityFlair;
  }

  /**
   * 플레어 목록 조회
   */
  async getFlairs(communityId: string, type?: "post" | "user"): Promise<CommunityFlair[]> {
    let query = this.db
      .select()
      .from(communityFlairs)
      .where(eq(communityFlairs.communityId, communityId));

    if (type) {
      query = (query as any).where(
        and(eq(communityFlairs.communityId, communityId), eq(communityFlairs.type, type))
      );
    }

    const items = await query.orderBy(communityFlairs.displayOrder);
    return items as CommunityFlair[];
  }

  /**
   * 모더레이터 초대
   */
  async inviteModerator(dto: InviteModeratorDto, inviterId: string): Promise<CommunityModerator> {
    const community = await this.communityService.findById(dto.communityId);
    if (!community) {
      throw new NotFoundException("커뮤니티를 찾을 수 없습니다.");
    }

    // Owner만 초대 가능
    await assertCommunityPermission(this.communityService, inviterId, dto.communityId, ["owner"]);

    const [moderator] = await this.db
      .insert(communityModerators)
      .values({
        communityId: dto.communityId,
        userId: dto.userId,
        permissions: dto.permissions,
        appointedBy: inviterId,
      })
      .returning();

    // Mod log 기록
    await this.logModAction({
      communityId: dto.communityId,
      moderatorId: inviterId,
      action: "other",
      targetType: "user",
      targetId: dto.userId,
      reason: "Moderator invited",
    });

    return moderator as CommunityModerator;
  }

  /**
   * 모더레이터 제거
   */
  async removeModerator(
    communityId: string,
    userId: string,
    removerId: string
  ): Promise<void> {
    const community = await this.communityService.findById(communityId);
    if (!community) {
      throw new NotFoundException("커뮤니티를 찾을 수 없습니다.");
    }

    // Owner만 제거 가능
    await assertCommunityPermission(this.communityService, removerId, communityId, ["owner"]);

    await this.db
      .delete(communityModerators)
      .where(and(eq(communityModerators.communityId, communityId), eq(communityModerators.userId, userId)));

    // Mod log 기록
    await this.logModAction({
      communityId,
      moderatorId: removerId,
      action: "other",
      targetType: "user",
      targetId: userId,
      reason: "Moderator removed",
    });
  }

  /**
   * Mod Log 기록
   */
  async logModAction(data: {
    communityId: string;
    moderatorId: string;
    action: any;
    targetType?: any;
    targetId?: string;
    reason?: string;
  }): Promise<void> {
    await this.db.insert(communityModLogs).values({
      communityId: data.communityId,
      moderatorId: data.moderatorId,
      action: data.action,
      targetType: data.targetType ?? null,
      targetId: data.targetId,
      reason: data.reason,
    });
  }

  /**
   * Mod Log 조회
   */
  async getModLogs(communityId: string, page: number = 1, limit: number = 50) {
    const offset = (page - 1) * limit;

    const [items, totalResult] = await Promise.all([
      this.db
        .select()
        .from(communityModLogs)
        .where(eq(communityModLogs.communityId, communityId))
        .orderBy(desc(communityModLogs.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(communityModLogs)
        .where(eq(communityModLogs.communityId, communityId)),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      items,
      total,
      page,
      limit,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * [Admin] 전체 신고 목록 조회 (cross-community)
   */
  async getAllReports(input: { status?: string; page: number; limit: number }) {
    const { page, limit, status } = input;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (status) {
      conditions.push(eq(communityReports.status, status as any));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db.select().from(communityReports)
        .where(whereClause)
        .orderBy(desc(communityReports.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: count() }).from(communityReports).where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * [Admin] 전체 신고 통계
   */
  async getReportStats() {
    const results = await this.db
      .select({
        status: communityReports.status,
        count: count(),
      })
      .from(communityReports)
      .groupBy(communityReports.status);

    const stats = { pending: 0, reviewing: 0, resolved: 0, dismissed: 0 };
    for (const row of results) {
      if (row.status in stats) {
        stats[row.status as keyof typeof stats] = row.count;
      }
    }
    return stats;
  }
}
