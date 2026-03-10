import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  content: string | null;
  data?: unknown;
  createdAt: Date;
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: '*',
    credentials: true,
  },
})
@Injectable()
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server!: Server;

  // userId -> Set<socketId>
  private userSockets = new Map<string, Set<string>>();

  /**
   * 클라이언트 연결 시
   */
  handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId || client.handshake.query?.userId;

    if (!userId || typeof userId !== 'string') {
      this.logger.warn(`Client ${client.id} connected without userId`);
      return;
    }

    // 사용자 소켓 등록
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);

    // 사용자 전용 Room 참가
    client.join(`user:${userId}`);

    this.logger.log(`Client ${client.id} connected for user ${userId}`);
  }

  /**
   * 클라이언트 연결 해제 시
   */
  handleDisconnect(client: Socket) {
    const userId = client.handshake.auth?.userId || client.handshake.query?.userId;

    if (userId && typeof userId === 'string' && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);

      // 사용자의 모든 소켓이 해제되면 Map에서 제거
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    this.logger.log(`Client ${client.id} disconnected`);
  }

  /**
   * 특정 사용자에게 알림 전송
   */
  sendToUser(userId: string, notification: NotificationPayload) {
    this.server.to(`user:${userId}`).emit('notification', notification);
    this.logger.debug(`Sent notification to user ${userId}: ${notification.title}`);
  }

  /**
   * 여러 사용자에게 알림 전송
   */
  sendToUsers(userIds: string[], notification: NotificationPayload) {
    for (const userId of userIds) {
      this.sendToUser(userId, notification);
    }
  }

  /**
   * 모든 연결된 사용자에게 알림 전송
   */
  broadcast(notification: NotificationPayload) {
    this.server.emit('notification', notification);
    this.logger.debug(`Broadcast notification: ${notification.title}`);
  }

  /**
   * 사용자가 온라인인지 확인
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  /**
   * 온라인 사용자 수 조회
   */
  getOnlineUserCount(): number {
    return this.userSockets.size;
  }

  /**
   * 클라이언트에서 알림 읽음 확인 메시지 수신
   */
  @SubscribeMessage('markAsRead')
  handleMarkAsRead(client: Socket, payload: { notificationId: string }) {
    const userId = client.handshake.auth?.userId || client.handshake.query?.userId;
    this.logger.debug(`User ${userId} marked notification ${payload.notificationId} as read`);
    // 실제 읽음 처리는 NotificationService에서 수행
    // 여기서는 다른 디바이스에 읽음 상태 동기화
    if (userId) {
      this.server.to(`user:${userId}`).emit('notificationRead', {
        notificationId: payload.notificationId,
      });
    }
  }
}
