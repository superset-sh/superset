import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { User } from "../../trpc/trpc";

/**
 * 컨트롤러 파라미터에서 인증된 사용자를 추출하는 데코레이터.
 * JwtAuthGuard와 함께 사용해야 합니다.
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard)
 * @Get('me')
 * async getProfile(@CurrentUser() user: User) {
 *   return this.service.getProfile(user.id);
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
