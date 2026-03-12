import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from "@nestjs/common";
import { eq, and, sql } from "drizzle-orm";
import { DRIZZLE } from "@superbuilder/features-db";
import { baMembers } from "@superbuilder/features-db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

const ADMIN_ROLES = ["owner", "admin"];

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

    try {
      const membership = await this.db
        .select({ role: baMembers.role })
        .from(baMembers)
        .where(
          and(
            eq(baMembers.userId, user.id),
            sql`${baMembers.role} = ANY(${ADMIN_ROLES})`,
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new ForbiddenException("관리자 권한이 필요합니다.");
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ForbiddenException("관리자 권한이 필요합니다.");
    }

    return true;
  }
}
