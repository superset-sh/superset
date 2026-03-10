import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and, desc, count, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '@superbuilder/drizzle';
import { notifications, notificationSettings, profiles } from '@superbuilder/drizzle';
import type {
  CreateNotificationInput,
  UpdateSettingsInput,
  BroadcastInput,
  NotificationQueryInput,
} from '../dto';
import type { NotificationListResponse, UnreadCountResponse } from '../types';

@Injectable()
export class NotificationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>
  ) {}

  // ========== Notifications (Auth) ==========

  /**
   * 알림 목록 조회
   */
  async list(userId: string, input?: NotificationQueryInput): Promise<NotificationListResponse> {
    const { page = 1, limit = 20, unreadOnly = false, type } = input ?? {};
    const offset = (page - 1) * limit;

    const whereConditions: ReturnType<typeof eq>[] = [eq(notifications.userId, userId)];

    if (unreadOnly) {
      whereConditions.push(isNull(notifications.readAt));
    }

    if (type) {
      whereConditions.push(eq(notifications.type, type));
    }

    const whereClause = and(...whereConditions);

    const [items, totalResult] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(notifications.createdAt)),
      this.db.select({ count: count() }).from(notifications).where(whereClause),
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
   * 읽지 않은 알림 수 조회
   */
  async getUnreadCount(userId: string): Promise<UnreadCountResponse> {
    const result = await this.db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

    return { count: result[0]?.count ?? 0 };
  }

  /**
   * 알림 읽음 처리
   */
  async markAsRead(userId: string, notificationId: string): Promise<{ success: boolean }> {
    const [notification] = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .limit(1);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, notificationId));

    return { success: true };
  }

  /**
   * 전체 읽음 처리
   */
  async markAllAsRead(userId: string): Promise<{ success: boolean; count: number }> {
    // 먼저 읽지 않은 알림 수를 조회
    const countResult = await this.db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

    const unreadCount = countResult[0]?.count ?? 0;

    // 업데이트 실행
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

    return { success: true, count: unreadCount };
  }

  // ========== Settings (Auth) ==========

  /**
   * 알림 설정 조회
   */
  async getSettings(userId: string) {
    const settings = await this.db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId));

    // 기본 설정이 없으면 모든 타입에 대해 기본값 반환
    const defaultTypes = ['comment', 'like', 'follow', 'mention', 'system', 'announcement'] as const;
    const settingsMap = new Map(settings.map((s) => [s.type, s]));

    return defaultTypes.map((type) => {
      const existing = settingsMap.get(type);
      return (
        existing ?? {
          type,
          enabled: true,
          channels: ['inapp'],
        }
      );
    });
  }

  /**
   * 알림 설정 업데이트
   */
  async updateSettings(
    userId: string,
    input: UpdateSettingsInput
  ): Promise<{ success: boolean }> {
    const [existing] = await this.db
      .select()
      .from(notificationSettings)
      .where(
        and(
          eq(notificationSettings.userId, userId),
          eq(notificationSettings.type, input.type)
        )
      )
      .limit(1);

    if (existing) {
      await this.db
        .update(notificationSettings)
        .set({
          enabled: input.enabled,
          channels: input.channels ?? existing.channels,
        })
        .where(eq(notificationSettings.id, existing.id));
    } else {
      await this.db.insert(notificationSettings).values({
        userId,
        type: input.type,
        enabled: input.enabled,
        channels: input.channels ?? ['inapp'],
      });
    }

    return { success: true };
  }

  // ========== Internal (다른 Feature에서 호출) ==========

  /**
   * 알림 생성 (내부 사용)
   */
  async create(input: CreateNotificationInput) {
    // 사용자 설정 확인
    const [setting] = await this.db
      .select()
      .from(notificationSettings)
      .where(
        and(
          eq(notificationSettings.userId, input.userId),
          eq(notificationSettings.type, input.type)
        )
      )
      .limit(1);

    // 설정이 비활성화되어 있으면 알림 생성 안함
    if (setting && !setting.enabled) {
      return null;
    }

    const [notification] = await this.db
      .insert(notifications)
      .values({
        userId: input.userId,
        type: input.type,
        title: input.title,
        content: input.content,
        data: input.data,
      })
      .returning();

    return notification;
  }

  // ========== Admin ==========

  /**
   * 전체 공지 발송 (Admin)
   */
  async broadcast(input: BroadcastInput): Promise<{ success: boolean; count: number }> {
    let targetUsers: { id: string }[];

    if (input.targetUserIds && input.targetUserIds.length > 0) {
      // 특정 사용자에게만 발송
      targetUsers = input.targetUserIds.map((id) => ({ id }));
    } else {
      // 전체 사용자에게 발송
      targetUsers = await this.db.select({ id: profiles.id }).from(profiles);
    }

    // 배치 삽입
    const notificationValues = targetUsers.map((user) => ({
      userId: user.id,
      type: 'announcement' as const,
      title: input.title,
      content: input.content,
      data: null,
    }));

    if (notificationValues.length > 0) {
      await this.db.insert(notifications).values(notificationValues);
    }

    return { success: true, count: notificationValues.length };
  }

  /**
   * 알림 통계 조회 (Admin)
   */
  async getStats() {
    const [totalResult, unreadResult, todayResult] = await Promise.all([
      this.db.select({ count: count() }).from(notifications),
      this.db
        .select({ count: count() })
        .from(notifications)
        .where(isNull(notifications.readAt)),
      this.db
        .select({ count: count() })
        .from(notifications)
        .where(sql`${notifications.createdAt} >= CURRENT_DATE`),
    ]);

    return {
      total: totalResult[0]?.count ?? 0,
      unread: unreadResult[0]?.count ?? 0,
      today: todayResult[0]?.count ?? 0,
    };
  }
}
