import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  NotImplementedException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE, marketingSnsAccounts } from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";

const logger = createLogger("marketing");
import type { MarketingSnsAccount } from "@superbuilder/drizzle";
import type { ConnectAccountDto } from "../dto";

@Injectable()
export class SnsAccountService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>
  ) {}

  /**
   * 연결된 SNS 계정 목록 조회
   */
  async findAccounts(userId: string): Promise<MarketingSnsAccount[]> {
    return this.db
      .select()
      .from(marketingSnsAccounts)
      .where(eq(marketingSnsAccounts.userId, userId));
  }

  /**
   * SNS 계정 연결 (OAuth 토큰 교환)
   */
  async connectAccount(
    input: ConnectAccountDto,
    userId: string,
  ): Promise<MarketingSnsAccount> {
    void input;
    void userId;

    throw new NotImplementedException(
      "실제 OAuth 토큰 교환 provider가 아직 연결되지 않았습니다. 현재 환경에서는 SNS 계정 연결 API를 사용할 수 없습니다.",
    );
  }

  /**
   * SNS 계정 연결 해제
   */
  async disconnectAccount(
    accountId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const [account] = await this.db
      .select()
      .from(marketingSnsAccounts)
      .where(eq(marketingSnsAccounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new NotFoundException(`계정을 찾을 수 없습니다: ${accountId}`);
    }

    if (account.userId !== userId) {
      throw new ForbiddenException("계정 연결 해제 권한이 없습니다");
    }

    await this.db
      .update(marketingSnsAccounts)
      .set({ isActive: false })
      .where(eq(marketingSnsAccounts.id, accountId));

    logger.info("SNS account disconnected", {
      "marketing.account_id": accountId,
      "marketing.platform": account.platform,
      "user.id": userId,
    });

    return { success: true };
  }

  /**
   * 토큰 갱신
   */
  async refreshToken(accountId: string): Promise<MarketingSnsAccount> {
    const [account] = await this.db
      .select()
      .from(marketingSnsAccounts)
      .where(eq(marketingSnsAccounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new NotFoundException(`계정을 찾을 수 없습니다: ${accountId}`);
    }

    throw new NotImplementedException(
      `플랫폼(${account.platform}) OAuth 토큰 갱신 provider가 연결되지 않았습니다. 계정을 재연결해 주세요.`,
    );
  }

  /**
   * 유효한 계정 반환 (비활성/만료 시 에러)
   */
  async getValidAccount(accountId: string, userId?: string): Promise<MarketingSnsAccount> {
    const [account] = await this.db
      .select()
      .from(marketingSnsAccounts)
      .where(eq(marketingSnsAccounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new NotFoundException(`계정을 찾을 수 없습니다: ${accountId}`);
    }

    if (userId && account.userId !== userId) {
      throw new ForbiddenException("해당 계정에 접근할 권한이 없습니다");
    }

    if (!account.isActive) {
      throw new BadRequestException("비활성화된 계정입니다");
    }

    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      throw new BadRequestException(
        "토큰이 만료되었습니다. 재연결이 필요합니다.",
      );
    }

    return account;
  }
}
