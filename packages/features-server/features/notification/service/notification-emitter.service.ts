import { Injectable, Optional } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationGateway, NotificationPayload } from '../gateway/notification.gateway';
import type { CreateNotificationInput } from '../dto';

/**
 * NotificationEmitter
 *
 * 다른 Feature에서 알림을 발송할 때 사용하는 서비스
 * DB 저장 + 실시간 전송을 함께 처리
 *
 * @example
 * // CommentService에서 사용
 * await this.notificationEmitter.emit({
 *   userId: post.authorId,
 *   type: 'comment',
 *   title: '새 댓글이 달렸습니다',
 *   content: `${commenter.name}님이 댓글을 남겼습니다`,
 *   data: { postId: post.id, commentId: comment.id },
 * });
 */
@Injectable()
export class NotificationEmitterService {
  constructor(
    private readonly notificationService: NotificationService,
    @Optional() private readonly gateway?: NotificationGateway
  ) {}

  /**
   * 알림 발송 (DB 저장 + 실시간 전송)
   */
  async emit(input: CreateNotificationInput): Promise<void> {
    // 1. DB에 저장
    const notification = await this.notificationService.create(input);

    // 설정에 의해 알림이 생성되지 않은 경우
    if (!notification) {
      return;
    }

    // 2. 실시간 전송 (Gateway가 있는 경우)
    if (this.gateway) {
      const payload: NotificationPayload = {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        content: notification.content,
        data: notification.data,
        createdAt: notification.createdAt,
      };

      this.gateway.sendToUser(input.userId, payload);
    }
  }

  /**
   * 여러 사용자에게 알림 발송
   */
  async emitToMany(
    userIds: string[],
    notification: Omit<CreateNotificationInput, 'userId'>
  ): Promise<void> {
    await Promise.all(
      userIds.map((userId) =>
        this.emit({
          ...notification,
          userId,
        })
      )
    );
  }

  /**
   * 공지 발송 (전체 또는 특정 사용자 그룹)
   */
  async broadcast(
    title: string,
    content: string,
    targetUserIds?: string[]
  ): Promise<{ count: number }> {
    const result = await this.notificationService.broadcast({
      title,
      content,
      targetUserIds,
    });

    // 실시간 전송
    if (this.gateway) {
      const payload: NotificationPayload = {
        id: `broadcast-${Date.now()}`,
        type: 'announcement',
        title,
        content,
        createdAt: new Date(),
      };

      if (targetUserIds && targetUserIds.length > 0) {
        this.gateway.sendToUsers(targetUserIds, payload);
      } else {
        this.gateway.broadcast(payload);
      }
    }

    return result;
  }

  /**
   * 사용자가 온라인인지 확인
   */
  isUserOnline(userId: string): boolean {
    return this.gateway?.isUserOnline(userId) ?? false;
  }
}
