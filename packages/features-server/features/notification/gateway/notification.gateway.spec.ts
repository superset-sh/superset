import { Test, TestingModule } from '@nestjs/testing';
import { NotificationGateway } from './notification.gateway';
import { Server, Socket } from 'socket.io';

// Mock Socket
const createMockSocket = (userId?: string): Partial<Socket> => ({
  id: `socket-${Math.random().toString(36).substr(2, 9)}`,
  handshake: {
    auth: { userId },
    query: {},
  } as any,
  join: jest.fn(),
});

// Mock Server
const createMockServer = (): Partial<Server> => ({
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
});

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;
  let mockServer: Partial<Server>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationGateway],
    }).compile();

    gateway = module.get<NotificationGateway>(NotificationGateway);
    mockServer = createMockServer();
    gateway.server = mockServer as Server;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('should register user socket on connection', () => {
      const userId = 'user-123';
      const mockSocket = createMockSocket(userId) as Socket;

      gateway.handleConnection(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith(`user:${userId}`);
      expect(gateway.isUserOnline(userId)).toBe(true);
    });

    it('should handle connection without userId', () => {
      const mockSocket = createMockSocket() as Socket;

      gateway.handleConnection(mockSocket);

      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('should allow multiple connections for same user', () => {
      const userId = 'user-123';
      const socket1 = createMockSocket(userId) as Socket;
      const socket2 = createMockSocket(userId) as Socket;

      gateway.handleConnection(socket1);
      gateway.handleConnection(socket2);

      expect(gateway.isUserOnline(userId)).toBe(true);
      expect(gateway.getOnlineUserCount()).toBe(1);
    });
  });

  describe('handleDisconnect', () => {
    it('should remove socket on disconnect', () => {
      const userId = 'user-123';
      const mockSocket = createMockSocket(userId) as Socket;

      gateway.handleConnection(mockSocket);
      expect(gateway.isUserOnline(userId)).toBe(true);

      gateway.handleDisconnect(mockSocket);
      expect(gateway.isUserOnline(userId)).toBe(false);
    });

    it('should keep user online if other sockets connected', () => {
      const userId = 'user-123';
      const socket1 = createMockSocket(userId) as Socket;
      const socket2 = createMockSocket(userId) as Socket;

      gateway.handleConnection(socket1);
      gateway.handleConnection(socket2);

      gateway.handleDisconnect(socket1);

      expect(gateway.isUserOnline(userId)).toBe(true);
    });
  });

  describe('sendToUser', () => {
    it('should send notification to specific user room', () => {
      const userId = 'user-123';
      const notification = {
        id: 'notif-1',
        type: 'comment',
        title: 'Test',
        content: null,
        createdAt: new Date(),
      };

      gateway.sendToUser(userId, notification);

      expect(mockServer.to).toHaveBeenCalledWith(`user:${userId}`);
      expect(mockServer.emit).toHaveBeenCalledWith('notification', notification);
    });
  });

  describe('sendToUsers', () => {
    it('should send notification to multiple users', () => {
      const userIds = ['user-1', 'user-2', 'user-3'];
      const notification = {
        id: 'notif-1',
        type: 'announcement',
        title: 'Test',
        content: null,
        createdAt: new Date(),
      };

      gateway.sendToUsers(userIds, notification);

      expect(mockServer.to).toHaveBeenCalledTimes(3);
      expect(mockServer.emit).toHaveBeenCalledTimes(3);
    });
  });

  describe('broadcast', () => {
    it('should broadcast to all connected clients', () => {
      const notification = {
        id: 'notif-1',
        type: 'announcement',
        title: 'Test',
        content: null,
        createdAt: new Date(),
      };

      gateway.broadcast(notification);

      expect(mockServer.emit).toHaveBeenCalledWith('notification', notification);
    });
  });

  describe('isUserOnline', () => {
    it('should return true for connected user', () => {
      const userId = 'user-123';
      const mockSocket = createMockSocket(userId) as Socket;

      gateway.handleConnection(mockSocket);

      expect(gateway.isUserOnline(userId)).toBe(true);
    });

    it('should return false for disconnected user', () => {
      expect(gateway.isUserOnline('unknown-user')).toBe(false);
    });
  });

  describe('getOnlineUserCount', () => {
    it('should return correct count of online users', () => {
      const socket1 = createMockSocket('user-1') as Socket;
      const socket2 = createMockSocket('user-2') as Socket;
      const socket3 = createMockSocket('user-1') as Socket; // Same user

      expect(gateway.getOnlineUserCount()).toBe(0);

      gateway.handleConnection(socket1);
      expect(gateway.getOnlineUserCount()).toBe(1);

      gateway.handleConnection(socket2);
      expect(gateway.getOnlineUserCount()).toBe(2);

      gateway.handleConnection(socket3); // Same user
      expect(gateway.getOnlineUserCount()).toBe(2);
    });
  });

  describe('handleMarkAsRead', () => {
    it('should emit notificationRead to user room', () => {
      const userId = 'user-123';
      const mockSocket = createMockSocket(userId) as Socket;

      gateway.handleMarkAsRead(mockSocket, { notificationId: 'notif-1' });

      expect(mockServer.to).toHaveBeenCalledWith(`user:${userId}`);
      expect(mockServer.emit).toHaveBeenCalledWith('notificationRead', {
        notificationId: 'notif-1',
      });
    });
  });
});
