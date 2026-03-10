import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { DRIZZLE } from '@superbuilder/drizzle';

// Mock Drizzle ORM functions
jest.mock('drizzle-orm', () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: 'eq' })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: 'and' })),
  desc: jest.fn((field: any) => ({ field, type: 'desc' })),
  count: jest.fn(() => ({ type: 'count' })),
  isNull: jest.fn((field: any) => ({ field, type: 'isNull' })),
  sql: jest.fn(() => ({ type: 'sql' })),
}));

// Mock schema tables
jest.mock('@superbuilder/drizzle', () => ({
  DRIZZLE: 'DRIZZLE_TOKEN',
  notifications: {
    id: { name: 'id' },
    userId: { name: 'user_id' },
    type: { name: 'type' },
    title: { name: 'title' },
    content: { name: 'content' },
    data: { name: 'data' },
    readAt: { name: 'read_at' },
    createdAt: { name: 'created_at' },
  },
  notificationSettings: {
    id: { name: 'id' },
    userId: { name: 'user_id' },
    type: { name: 'type' },
    enabled: { name: 'enabled' },
    channels: { name: 'channels' },
  },
  profiles: {
    id: { name: 'id' },
  },
}));

// Mock data
const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
const mockNotificationId = '223e4567-e89b-12d3-a456-426614174001';

const mockNotification = {
  id: mockNotificationId,
  userId: mockUserId,
  type: 'comment' as const,
  title: 'Test Notification',
  content: 'Test content',
  data: null,
  readAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockNotificationSetting = {
  id: '323e4567-e89b-12d3-a456-426614174002',
  userId: mockUserId,
  type: 'comment' as const,
  enabled: true,
  channels: ['inapp'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock Drizzle DB - creates a chainable mock that tracks calls
const createMockDb = () => {
  const resolveQueue: any[] = [];

  const createChainable = () => {
    const chain: any = {};
    const methods = ['select', 'from', 'where', 'limit', 'offset', 'orderBy', 'insert', 'values', 'returning', 'update', 'set'];

    methods.forEach((method) => {
      chain[method] = jest.fn().mockImplementation(() => {
        // Check if there's a queued resolve value and this could be a terminal method
        if (resolveQueue.length > 0) {
          const nextResolve = resolveQueue[0];
          if (nextResolve.method === method || nextResolve.method === 'any') {
            resolveQueue.shift();
            return Promise.resolve(nextResolve.value);
          }
        }
        return chain;
      });
    });

    // Helper to queue resolve values
    chain._queueResolve = (method: string, value: any) => {
      resolveQueue.push({ method, value });
    };

    // Reset queue
    chain._resetQueue = () => {
      resolveQueue.length = 0;
    };

    return chain;
  };

  return createChainable();
};

describe('NotificationService', () => {
  let service: NotificationService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  describe('list', () => {
    it('should return notification list with pagination', async () => {
      const mockItems = [mockNotification];
      // list() calls Promise.all with two queries:
      // 1. select().from().where().limit().offset().orderBy() -> items
      // 2. select().from().where() -> count
      mockDb._queueResolve('orderBy', mockItems);
      mockDb._queueResolve('where', [{ count: 1 }]);

      const result = await service.list(mockUserId, { page: 1, limit: 20 });

      expect(result).toEqual({
        items: mockItems,
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      });
    });

    it('should filter unread only notifications', async () => {
      const mockItems = [mockNotification];
      mockDb._queueResolve('orderBy', mockItems);
      mockDb._queueResolve('where', [{ count: 1 }]);

      const result = await service.list(mockUserId, { unreadOnly: true });

      expect(mockDb.where).toHaveBeenCalled();
      expect(result.items).toEqual(mockItems);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread notification count', async () => {
      mockDb._queueResolve('where', [{ count: 5 }]);

      const result = await service.getUnreadCount(mockUserId);

      expect(result).toEqual({ count: 5 });
    });

    it('should return 0 when no unread notifications', async () => {
      mockDb._queueResolve('where', [{ count: 0 }]);

      const result = await service.getUnreadCount(mockUserId);

      expect(result).toEqual({ count: 0 });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      // First query: select().from().where().limit() -> find notification
      mockDb._queueResolve('limit', [mockNotification]);
      // Second query: update().set().where() -> update
      mockDb._queueResolve('where', []);

      const result = await service.markAsRead(mockUserId, mockNotificationId);

      expect(result).toEqual({ success: true });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when notification not found', async () => {
      mockDb._queueResolve('limit', []);

      await expect(service.markAsRead(mockUserId, mockNotificationId)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      // First query: select count
      mockDb._queueResolve('where', [{ count: 3 }]);
      // Second query: update
      mockDb._queueResolve('where', []);

      const result = await service.markAllAsRead(mockUserId);

      expect(result).toEqual({ success: true, count: 3 });
    });
  });

  describe('getSettings', () => {
    it('should return user notification settings', async () => {
      mockDb._queueResolve('where', [mockNotificationSetting]);

      const result = await service.getSettings(mockUserId);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return default settings when no settings exist', async () => {
      mockDb._queueResolve('where', []);

      const result = await service.getSettings(mockUserId);

      expect(result).toHaveLength(6); // 6 notification types
      expect(result[0]).toHaveProperty('enabled', true);
    });
  });

  describe('updateSettings', () => {
    it('should update existing settings', async () => {
      // First query: check existing settings
      mockDb._queueResolve('limit', [mockNotificationSetting]);
      // Second query: update
      mockDb._queueResolve('where', []);

      const result = await service.updateSettings(mockUserId, {
        type: 'comment',
        enabled: false,
      });

      expect(result).toEqual({ success: true });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should create new settings when not exist', async () => {
      // First query: check existing settings (empty)
      mockDb._queueResolve('limit', []);
      // Second query: insert (returns via values chain)
      mockDb._queueResolve('values', []);

      const result = await service.updateSettings(mockUserId, {
        type: 'comment',
        enabled: true,
      });

      expect(result).toEqual({ success: true });
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a notification', async () => {
      // First query: check settings
      mockDb._queueResolve('limit', []); // No settings, default enabled
      // Second query: insert and return
      mockDb._queueResolve('returning', [mockNotification]);

      const result = await service.create({
        userId: mockUserId,
        type: 'comment',
        title: 'New Comment',
        content: 'Someone commented',
      });

      expect(result).toEqual(mockNotification);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should not create notification when disabled in settings', async () => {
      // First query: check settings (disabled)
      mockDb._queueResolve('limit', [{ ...mockNotificationSetting, enabled: false }]);

      const result = await service.create({
        userId: mockUserId,
        type: 'comment',
        title: 'New Comment',
      });

      expect(result).toBeNull();
    });
  });

  describe('broadcast', () => {
    it('should broadcast to all users', async () => {
      const mockUsers = [{ id: mockUserId }, { id: '456' }];
      // First query: select users
      mockDb._queueResolve('from', mockUsers);
      // Second query: insert notifications
      mockDb._queueResolve('values', []);

      const result = await service.broadcast({
        title: 'Announcement',
        content: 'Test announcement',
      });

      expect(result).toEqual({ success: true, count: 2 });
    });

    it('should broadcast to specific users', async () => {
      // Only insert, no select
      mockDb._queueResolve('values', []);

      const result = await service.broadcast({
        title: 'Announcement',
        content: 'Test announcement',
        targetUserIds: [mockUserId],
      });

      expect(result).toEqual({ success: true, count: 1 });
    });
  });

  describe('getStats', () => {
    it('should return notification statistics', async () => {
      // Promise.all with 3 queries:
      // 1. total count: select().from()
      // 2. unread count: select().from().where()
      // 3. today count: select().from().where()
      mockDb._queueResolve('from', [{ count: 100 }]);
      mockDb._queueResolve('where', [{ count: 30 }]);
      mockDb._queueResolve('where', [{ count: 10 }]);

      const result = await service.getStats();

      expect(result).toEqual({
        total: 100,
        unread: 30,
        today: 10,
      });
    });
  });
});
