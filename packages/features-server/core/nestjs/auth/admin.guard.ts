/**
 * NestJS Admin Guard
 *
 * JwtAuthGuard 이후에 실행되어 사용자의 admin/owner 역할을 확인.
 * user_roles + roles 테이블을 조회하여 권한을 검증한다.
 *
 * @example
 * ```ts
 * @UseGuards(JwtAuthGuard, NestAdminGuard)
 * @Get('admin/stats')
 * async getStats() { ... }
 * ```
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "@superbuilder/drizzle";
import { userRoles, roles } from "@superbuilder/drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

const ADMIN_ROLE_SLUGS = ["owner", "admin"];

@Injectable()
export class NestAdminGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id) {
      throw new ForbiddenException("관리자 권한이 필요합니다.");
    }

    let hasAdminRole = false;

    try {
      const result = await this.db
        .select({ slug: roles.slug })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, user.id))
        .limit(10);

      hasAdminRole = result.some((r) =>
        ADMIN_ROLE_SLUGS.includes(r.slug),
      );
    } catch {
      // user_roles/roles 테이블 미생성 시 안전하게 거부
      hasAdminRole = false;
    }

    if (!hasAdminRole) {
      throw new ForbiddenException("관리자 권한이 필요합니다.");
    }

    return true;
  }
}
