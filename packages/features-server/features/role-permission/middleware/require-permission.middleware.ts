import { TRPCError } from '@trpc/server';
import { middleware } from '../../../core/trpc';
import type { PermissionString } from '../types';
import { AuthorizationService } from '../services';

// 미들웨어에서 사용할 AuthorizationService 인스턴스 (OnModuleInit에서 주입)
let _authService: AuthorizationService | null = null;

export function injectAuthServiceForMiddleware(service: AuthorizationService) {
  _authService = service;
}

/**
 * tRPC Middleware to require specific permission
 *
 * Usage:
 * ```ts
 * const protectedProcedure = publicProcedure.use(requirePermission('posts.create'));
 * ```
 */
export function requirePermission(permission: PermissionString) {
  return middleware(async ({ ctx, next }) => {
    // Check if user is authenticated
    if (!ctx.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to perform this action',
      });
    }

    if (!_authService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Authorization service not available. Module not initialized.',
      });
    }

    // Check permission
    const hasPermission = await _authService.hasPermission(ctx.user.id, permission);

    if (!hasPermission) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You don't have permission to perform this action. Required: ${permission}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user, // Ensure user is passed through
      },
    });
  });
}

/**
 * tRPC Middleware to require any of the specified permissions
 *
 * Usage:
 * ```ts
 * const protectedProcedure = publicProcedure.use(
 *   requireAnyPermission(['posts.update.own', 'posts.update.all'])
 * );
 * ```
 */
export function requireAnyPermission(permissions: PermissionString[]) {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to perform this action',
      });
    }

    if (!_authService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Authorization service not available. Module not initialized.',
      });
    }

    const hasAnyPermission = await _authService.hasAnyPermission(ctx.user.id, permissions);

    if (!hasAnyPermission) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You don't have permission to perform this action. Required any of: ${permissions.join(', ')}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });
}

/**
 * tRPC Middleware to require all specified permissions
 *
 * Usage:
 * ```ts
 * const protectedProcedure = publicProcedure.use(
 *   requireAllPermissions(['posts.create', 'posts.publish'])
 * );
 * ```
 */
export function requireAllPermissions(permissions: PermissionString[]) {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to perform this action',
      });
    }

    if (!_authService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Authorization service not available. Module not initialized.',
      });
    }

    const hasAllPermissions = await _authService.hasAllPermissions(ctx.user.id, permissions);

    if (!hasAllPermissions) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You don't have all required permissions. Required: ${permissions.join(', ')}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });
}

/**
 * tRPC Middleware to check resource ownership
 *
 * This is a helper to check if user can access a specific resource
 * based on "own" vs "all" scope
 *
 * Usage:
 * ```ts
 * const updatePostProcedure = publicProcedure
 *   .use(requireResourceAccess({
 *     resource: 'posts',
 *     action: 'update',
 *     getResourceOwnerId: (input) => input.authorId,
 *   }));
 * ```
 */
export function requireResourceAccess<TInput extends Record<string, any>>(options: {
  resource: string;
  action: string;
  getResourceOwnerId: (input: TInput) => string | undefined;
}) {
  return middleware(async ({ ctx, input, next }) => {
    if (!ctx.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to perform this action',
      });
    }

    if (!_authService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Authorization service not available. Module not initialized.',
      });
    }

    const resourceOwnerId = options.getResourceOwnerId(input as TInput);

    const canAccess = await _authService.canAccessResource({
      userId: ctx.user.id,
      resource: options.resource,
      action: options.action,
      resourceOwnerId,
    });

    if (!canAccess) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You don't have permission to ${options.action} this ${options.resource}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });
}
