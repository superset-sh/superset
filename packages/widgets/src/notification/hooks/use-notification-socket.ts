import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { useTRPC } from '@superbuilder/features-client/trpc-client';
import type { NotificationItem } from '../types';

interface NotificationSocketOptions {
  /**
   * 사용자 ID (인증된 사용자)
   */
  userId: string | null;
  /**
   * WebSocket 서버 URL
   * @default window.location.origin
   */
  serverUrl?: string;
  /**
   * 새 알림 수신 시 콜백
   */
  onNotification?: (notification: NotificationItem) => void;
  /**
   * 알림 읽음 동기화 수신 시 콜백
   */
  onNotificationRead?: (notificationId: string) => void;
  /**
   * 연결 상태 변경 시 콜백
   */
  onConnectionChange?: (connected: boolean) => void;
}

/**
 * 실시간 알림 WebSocket Hook
 *
 * @example
 * const { isConnected, markAsReadViaSocket } = useNotificationSocket({
 *   userId: user?.id ?? null,
 *   onNotification: (notification) => {
 *     toast(`새 알림: ${notification.title}`);
 *   },
 * });
 */
export function useNotificationSocket(options: NotificationSocketOptions) {
  const { userId, serverUrl, onNotification, onNotificationRead, onConnectionChange } = options;

  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  // 연결 상태
  const isConnectedRef = useRef(false);

  /**
   * 알림을 WebSocket을 통해 읽음 처리 (다른 디바이스 동기화)
   */
  const markAsReadViaSocket = useCallback((notificationId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('markAsRead', { notificationId });
    }
  }, []);

  useEffect(() => {
    // userId가 없으면 연결하지 않음
    if (!userId) {
      return;
    }

    const wsUrl = serverUrl || window.location.origin;

    // Socket.IO 클라이언트 생성
    const socket = io(`${wsUrl}/notifications`, {
      auth: { userId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // 연결 성공
    socket.on('connect', () => {
      isConnectedRef.current = true;
      onConnectionChange?.(true);
    });

    // 연결 해제
    socket.on('disconnect', () => {
      isConnectedRef.current = false;
      onConnectionChange?.(false);
    });

    // 새 알림 수신
    socket.on('notification', (notification: NotificationItem) => {
      // 알림 목록 캐시 무효화
      queryClient.invalidateQueries({
        queryKey: trpc.notification.list.queryKey(),
      });
      // 읽지 않은 알림 수 캐시 무효화
      queryClient.invalidateQueries({
        queryKey: trpc.notification.unreadCount.queryKey(),
      });

      // 콜백 호출
      onNotification?.(notification);
    });

    // 알림 읽음 동기화 수신 (다른 디바이스에서 읽음 처리한 경우)
    socket.on('notificationRead', ({ notificationId }: { notificationId: string }) => {
      // 알림 목록 캐시 무효화
      queryClient.invalidateQueries({
        queryKey: trpc.notification.list.queryKey(),
      });
      // 읽지 않은 알림 수 캐시 무효화
      queryClient.invalidateQueries({
        queryKey: trpc.notification.unreadCount.queryKey(),
      });

      // 콜백 호출
      onNotificationRead?.(notificationId);
    });

    // 연결 오류
    socket.on('connect_error', (error) => {
      console.error('Notification socket connection error:', error.message);
    });

    // Cleanup
    return () => {
      socket.disconnect();
      socketRef.current = null;
      isConnectedRef.current = false;
    };
  }, [userId, serverUrl, onNotification, onNotificationRead, onConnectionChange, queryClient, trpc]);

  return {
    isConnected: isConnectedRef.current,
    markAsReadViaSocket,
  };
}
