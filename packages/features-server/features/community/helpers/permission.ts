import { ForbiddenException } from "@nestjs/common";
import type { CommunityService } from "../service";

type MemberRole = "owner" | "admin" | "moderator" | "member";

/**
 * Assert that the user has the required community membership role.
 * Throws ForbiddenException if the user is not a member or doesn't have the required role.
 */
export async function assertCommunityPermission(
  communityService: CommunityService,
  userId: string,
  communityId: string,
  requiredRoles: MemberRole[],
): Promise<void> {
  const membership = await communityService.getMembership(communityId, userId);

  if (!membership) {
    throw new ForbiddenException("이 커뮤니티의 멤버가 아닙니다.");
  }

  if (membership.isBanned) {
    throw new ForbiddenException("이 커뮤니티에서 차단되었습니다.");
  }

  if (!requiredRoles.includes(membership.role as MemberRole)) {
    throw new ForbiddenException("이 작업을 수행할 권한이 없습니다.");
  }
}

/**
 * Assert that the user is the owner of the resource.
 * Throws ForbiddenException if userId doesn't match the resource owner.
 */
export function assertResourceOwner(
  userId: string,
  resource: { ownerId?: string; authorId?: string; userId?: string },
): void {
  const resourceOwnerId = resource.ownerId ?? resource.authorId ?? resource.userId;

  if (!resourceOwnerId || resourceOwnerId !== userId) {
    throw new ForbiddenException("이 리소스의 소유자만 이 작업을 수행할 수 있습니다.");
  }
}
