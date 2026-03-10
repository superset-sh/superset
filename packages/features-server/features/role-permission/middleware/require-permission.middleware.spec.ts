import { TRPCError } from '@trpc/server';
import {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireResourceAccess,
  injectAuthServiceForMiddleware,
} from './require-permission.middleware';
import type { AuthorizationService } from '../services';

// Mock @/core/trpc middleware
jest.mock('@/core/trpc', () => ({
  middleware: jest.fn((fn: any) => fn),
}));

// Mock AuthorizationService
const createMockAuthService = (): jest.Mocked<
  Pick<AuthorizationService, 'hasPermission' | 'hasAnyPermission' | 'hasAllPermissions' | 'canAccessResource'>
> => ({
  hasPermission: jest.fn(),
  hasAnyPermission: jest.fn(),
  hasAllPermissions: jest.fn(),
  canAccessResource: jest.fn(),
});

// Helper to create mock context
const createMockCtx = (userId?: string) => ({
  user: userId ? { id: userId } : null,
});

const mockNext = jest.fn(({ ctx }: any) => Promise.resolve({ ctx }));

const mockUserId = '123e4567-e89b-12d3-a456-426614174000';

describe('require-permission middleware', () => {
  let mockAuthService: ReturnType<typeof createMockAuthService>;

  beforeEach(() => {
    mockAuthService = createMockAuthService();
    injectAuthServiceForMiddleware(mockAuthService as any);
    mockNext.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // requirePermission
  // =========================================================================
  describe('requirePermission', () => {
    it('should call next when user has permission', async () => {
      mockAuthService.hasPermission.mockResolvedValue(true);
      const mw = requirePermission('posts.create');

      await mw({ ctx: createMockCtx(mockUserId), next: mockNext, input: undefined } as any);

      expect(mockAuthService.hasPermission).toHaveBeenCalledWith(mockUserId, 'posts.create');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UNAUTHORIZED when user not logged in', async () => {
      const mw = requirePermission('posts.create');

      await expect(
        mw({ ctx: createMockCtx(), next: mockNext, input: undefined } as any)
      ).rejects.toThrow(TRPCError);

      try {
        await mw({ ctx: createMockCtx(), next: mockNext, input: undefined } as any);
      } catch (err: any) {
        expect(err.code).toBe('UNAUTHORIZED');
        expect(err.message).toContain('logged in');
      }
    });

    it('should throw INTERNAL_SERVER_ERROR when auth service not injected', async () => {
      injectAuthServiceForMiddleware(null as any);
      const mw = requirePermission('posts.create');

      await expect(
        mw({ ctx: createMockCtx(mockUserId), next: mockNext, input: undefined } as any)
      ).rejects.toThrow(TRPCError);

      try {
        injectAuthServiceForMiddleware(null as any);
        await mw({ ctx: createMockCtx(mockUserId), next: mockNext, input: undefined } as any);
      } catch (err: any) {
        expect(err.code).toBe('INTERNAL_SERVER_ERROR');
      }
    });

    it('should throw FORBIDDEN when user lacks permission', async () => {
      mockAuthService.hasPermission.mockResolvedValue(false);
      const mw = requirePermission('admin.settings');

      await expect(
        mw({ ctx: createMockCtx(mockUserId), next: mockNext, input: undefined } as any)
      ).rejects.toThrow(TRPCError);

      try {
        mockAuthService.hasPermission.mockResolvedValue(false);
        await mw({ ctx: createMockCtx(mockUserId), next: mockNext, input: undefined } as any);
      } catch (err: any) {
        expect(err.code).toBe('FORBIDDEN');
        expect(err.message).toContain('admin.settings');
      }
    });
  });

  // =========================================================================
  // requireAnyPermission
  // =========================================================================
  describe('requireAnyPermission', () => {
    it('should call next when user has any of the permissions', async () => {
      mockAuthService.hasAnyPermission.mockResolvedValue(true);
      const mw = requireAnyPermission(['posts.update.own', 'posts.update.all']);

      await mw({ ctx: createMockCtx(mockUserId), next: mockNext, input: undefined } as any);

      expect(mockAuthService.hasAnyPermission).toHaveBeenCalledWith(
        mockUserId,
        ['posts.update.own', 'posts.update.all']
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UNAUTHORIZED when user not logged in', async () => {
      const mw = requireAnyPermission(['posts.create']);

      await expect(
        mw({ ctx: createMockCtx(), next: mockNext, input: undefined } as any)
      ).rejects.toThrow(TRPCError);
    });

    it('should throw FORBIDDEN when user has none of the permissions', async () => {
      mockAuthService.hasAnyPermission.mockResolvedValue(false);
      const mw = requireAnyPermission(['admin.settings', 'admin.access']);

      try {
        await mw({ ctx: createMockCtx(mockUserId), next: mockNext, input: undefined } as any);
      } catch (err: any) {
        expect(err.code).toBe('FORBIDDEN');
        expect(err.message).toContain('Required any of');
      }
    });
  });

  // =========================================================================
  // requireAllPermissions
  // =========================================================================
  describe('requireAllPermissions', () => {
    it('should call next when user has all permissions', async () => {
      mockAuthService.hasAllPermissions.mockResolvedValue(true);
      const mw = requireAllPermissions(['posts.create', 'posts.read']);

      await mw({ ctx: createMockCtx(mockUserId), next: mockNext, input: undefined } as any);

      expect(mockAuthService.hasAllPermissions).toHaveBeenCalledWith(
        mockUserId,
        ['posts.create', 'posts.read']
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw FORBIDDEN when user lacks some permissions', async () => {
      mockAuthService.hasAllPermissions.mockResolvedValue(false);
      const mw = requireAllPermissions(['posts.create', 'admin.settings']);

      try {
        await mw({ ctx: createMockCtx(mockUserId), next: mockNext, input: undefined } as any);
      } catch (err: any) {
        expect(err.code).toBe('FORBIDDEN');
        expect(err.message).toContain('Required:');
      }
    });
  });

  // =========================================================================
  // requireResourceAccess
  // =========================================================================
  describe('requireResourceAccess', () => {
    it('should call next when user can access resource', async () => {
      mockAuthService.canAccessResource.mockResolvedValue(true);
      const mw = requireResourceAccess({
        resource: 'posts',
        action: 'update',
        getResourceOwnerId: (input: any) => input.authorId,
      });

      await mw({
        ctx: createMockCtx(mockUserId),
        next: mockNext,
        input: { authorId: 'some-author-id' },
      } as any);

      expect(mockAuthService.canAccessResource).toHaveBeenCalledWith({
        userId: mockUserId,
        resource: 'posts',
        action: 'update',
        resourceOwnerId: 'some-author-id',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UNAUTHORIZED when user not logged in', async () => {
      const mw = requireResourceAccess({
        resource: 'posts',
        action: 'update',
        getResourceOwnerId: (input: any) => input.authorId,
      });

      await expect(
        mw({ ctx: createMockCtx(), next: mockNext, input: {} } as any)
      ).rejects.toThrow(TRPCError);
    });

    it('should throw FORBIDDEN when user cannot access resource', async () => {
      mockAuthService.canAccessResource.mockResolvedValue(false);
      const mw = requireResourceAccess({
        resource: 'posts',
        action: 'delete',
        getResourceOwnerId: (input: any) => input.authorId,
      });

      try {
        await mw({
          ctx: createMockCtx(mockUserId),
          next: mockNext,
          input: { authorId: 'other-user' },
        } as any);
      } catch (err: any) {
        expect(err.code).toBe('FORBIDDEN');
        expect(err.message).toContain('delete');
        expect(err.message).toContain('posts');
      }
    });
  });
});
