import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { parseJwtFromHeader } from "./jwt-parser";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = parseJwtFromHeader(request.headers.authorization);

    if (!user) {
      throw new UnauthorizedException("인증이 필요합니다.");
    }

    request.user = user;
    return true;
  }
}
