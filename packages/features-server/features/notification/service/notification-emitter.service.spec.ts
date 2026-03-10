import { Test, TestingModule } from '@nestjs/testing';
import { NotificationEmitterService } from './notification-emitter.service';
import { NotificationService } from './notification.service';
import { NotificationGateway } from '../gateway/notification.gateway';

// Mock data
const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
const mockNotification = {
  id: '223e4567-e89b-12d3-a456-426614174001',
  userId: mockUserId,
  type: 'comment' as const,
  title: 'Test Notification',
  content: 'Test content',
  data: null,
  readAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('NotificationEmitterService', () => {
  let emitterService: NotificationEmitterService;
  let notificationService: jest.Mocked<NotificationService>;
  let gateway: jest.Mocked<NotificationGateway>;

  beforeEach(async () => {
    const mockNotificationService = {
      create: jest.fn(),
      broadcast: jest.fn(),
    };

    const mockGateway = {
      sendToUser: jest.fn(),
      sendToUsers: jest.fn(),
      broadcast: jest.fn(),
      isUserOnline: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEmitterService,
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: NotificationGateway,
          useValue: mockGateway,
        },
      ],
    }).compile();

    emitterService = module.get<NotificationEmitterService>(NotificationEmitterService);
    notificationService = module.get(NotificationService);
    gateway = module.get(NotificationGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('emit', () => {
    it('should create notification and send via websocket', async () => {
      notificationService.create.mockResolvedValue(mockNotification);

      await emitterService.emit({
        userId: mockUserId,
        type: 'comment',
        title: 'Test',
        content: 'Test content',
      });

      expect(notificationService.create).toHaveBeenCalledWith({
        userId: mockUserId,
        type: 'comment',
        title: 'Test',
        content: 'Test content',
      });

      expect(gateway.sendToUser).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          id: mockNotification.id,
          type: mockNotification.type,
          title: mockNotification.title,
        })
      );
    });

    it('should not send websocket when notification is disabled', async () => {
      notificationService.create.mockResolvedValue(null);

      await emitterService.emit({
        userId: mockUserId,
        type: 'comment',
        title: 'Test',
      });

      expect(notificationService.create).toHaveBeenCalled();
      expect(gateway.sendToUser).not.toHaveBeenCalled();
    });
  });

  describe('emitToMany', () => {
    it('should emit to multiple users', async () => {
      notificationService.create.mockResolvedValue(mockNotification);

      const userIds = ['user1', 'user2', 'user3'];

      await emitterService.emitToMany(userIds, {
        type: 'announcement',
        title: 'Test',
        content: 'Test content',
      });

      expect(notificationService.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('broadcast', () => {
    it('should broadcast announcement to all users', async () => {
      notificationService.broadcast.mockResolvedValue({ success: true, count: 10 });

      const result = await emitterService.broadcast('Test Title', 'Test Content');

      expect(notificationService.broadcast).toHaveBeenCalledWith({
        title: 'Test Title',
        content: 'Test Content',
        targetUserIds: undefined,
      });

      expect(gateway.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'announcement',
          title: 'Test Title',
          content: 'Test Content',
        })
      );

      expect(result).toEqual({ success: true, count: 10 });
    });

    it('should broadcast to specific users', async () => {
      notificationService.broadcast.mockResolvedValue({ success: true, count: 2 });

      const targetUserIds = ['user1', 'user2'];

      const result = await emitterService.broadcast('Test', 'Content', targetUserIds);

      expect(gateway.sendToUsers).toHaveBeenCalledWith(
        targetUserIds,
        expect.objectContaining({
          type: 'announcement',
          title: 'Test',
        })
      );

      expect(result).toEqual({ success: true, count: 2 });
    });
  });

  describe('isUserOnline', () => {
    it('should return true when user is online', () => {
      gateway.isUserOnline.mockReturnValue(true);

      const result = emitterService.isUserOnline(mockUserId);

      expect(result).toBe(true);
      expect(gateway.isUserOnline).toHaveBeenCalledWith(mockUserId);
    });

    it('should return false when user is offline', () => {
      gateway.isUserOnline.mockReturnValue(false);

      const result = emitterService.isUserOnline(mockUserId);

      expect(result).toBe(false);
    });
  });
});
