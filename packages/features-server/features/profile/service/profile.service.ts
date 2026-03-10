import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { eq, count, ilike, or, desc, and, isNull, isNotNull, asc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE, profiles, terms, profileWithdrawalReasons, subscriptions } from '@superbuilder/drizzle';
import type { UpdateProfileInput, CreateTermInput, UpdateTermInput, WithdrawInput } from '../dto';
import { createLogger } from '../../../core/logger';

const logger = createLogger('profile');

@Injectable()
export class ProfileService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>
  ) {}

  /**
   * 내 프로필 조회
   */
  async getProfile(userId: string) {
    const [profile] = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  /**
   * 프로필 수정
   */
  async updateProfile(userId: string, input: UpdateProfileInput) {
    // 프로필 존재 확인
    const [existing] = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Profile not found');
    }

    // 업데이트
    const [updated] = await this.db
      .update(profiles)
      .set({
        name: input.name,
        avatar: input.avatar ?? existing.avatar,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, userId))
      .returning();

    return updated;
  }

  /**
   * 아바타 URL 업데이트
   */
  async updateAvatar(userId: string, avatarUrl: string | null) {
    const [updated] = await this.db
      .update(profiles)
      .set({
        avatar: avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, userId))
      .returning();

    if (!updated) {
      throw new NotFoundException('Profile not found');
    }

    return updated;
  }

  /**
   * [Admin] 전체 사용자 목록 (페이지네이션 + 검색)
   */
  async listAll(input: { page: number; limit: number; search?: string; marketingConsent?: 'agreed' | 'not_agreed' }) {
    const { page, limit, search, marketingConsent } = input;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (search) {
      conditions.push(
        or(
          ilike(profiles.name, `%${search}%`),
          ilike(profiles.email, `%${search}%`)
        )
      );
    }

    // 마케팅 동의 필터
    if (marketingConsent === 'agreed') {
      conditions.push(isNotNull(profiles.marketingConsentAt));
    } else if (marketingConsent === 'not_agreed') {
      conditions.push(isNull(profiles.marketingConsentAt));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(profiles)
        .where(whereClause)
        .orderBy(desc(profiles.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: count() }).from(profiles).where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * [Admin] 역할 변경
   * 참고: 실제 역할 변경은 role-permission feature의 user_roles를 통해 관리
   * 여기서는 대상 존재 확인 + updatedAt만 갱신
   */
  async updateRole(targetId: string, _role: string, actorId: string) {
    if (actorId === targetId) {
      throw new ForbiddenException('자기 자신의 역할은 변경할 수 없습니다');
    }

    // 대상 사용자 존재 확인
    await this.getProfile(targetId);

    const [updated] = await this.db
      .update(profiles)
      .set({ updatedAt: new Date() })
      .where(eq(profiles.id, targetId))
      .returning();

    return updated;
  }

  /**
   * [Admin] 사용자 비활성화
   */
  async deactivate(targetId: string, actorId: string) {
    if (actorId === targetId) {
      throw new ForbiddenException('자기 자신을 비활성화할 수 없습니다');
    }

    await this.getProfile(targetId);

    const [updated] = await this.db
      .update(profiles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(profiles.id, targetId))
      .returning();

    return updated;
  }

  /**
   * [Admin] 사용자 재활성화
   */
  async reactivate(targetId: string) {
    await this.getProfile(targetId);

    const [updated] = await this.db
      .update(profiles)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(profiles.id, targetId))
      .returning();

    return updated;
  }

  // ========== Terms ==========

  /**
   * 약관 목록 조회
   * @param onlyActive true면 활성 약관만, false면 전체
   */
  async listTerms(onlyActive: boolean = true) {
    const conditions = onlyActive ? eq(terms.isActive, true) : undefined;

    return this.db
      .select()
      .from(terms)
      .where(conditions)
      .orderBy(asc(terms.sortOrder), asc(terms.createdAt));
  }

  /**
   * [Admin] 약관 등록
   */
  async createTerm(input: CreateTermInput) {
    const [term] = await this.db
      .insert(terms)
      .values(input)
      .returning();

    if (!term) {
      throw new NotFoundException('Failed to create term');
    }

    logger.info('Term created', {
      'profile.term_id': term.id,
      'profile.term_name': term.name,
    });

    return term;
  }

  /**
   * [Admin] 약관 수정
   */
  async updateTerm(id: string, input: UpdateTermInput) {
    const [existing] = await this.db
      .select()
      .from(terms)
      .where(eq(terms.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Term not found: ${id}`);
    }

    const [updated] = await this.db
      .update(terms)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(terms.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Term not found: ${id}`);
    }

    logger.info('Term updated', {
      'profile.term_id': id,
      'profile.term_name': updated.name,
    });

    return updated;
  }

  /**
   * [Admin] 약관 비활성화 (soft delete)
   */
  async deleteTerm(id: string) {
    const [existing] = await this.db
      .select()
      .from(terms)
      .where(eq(terms.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Term not found: ${id}`);
    }

    await this.db
      .update(terms)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(terms.id, id));

    logger.info('Term deactivated', {
      'profile.term_id': id,
      'profile.term_name': existing.name,
    });

    return { success: true };
  }

  // ========== Withdrawal ==========

  async checkWithdrawable(userId: string) {
    await this.getProfile(userId);
    const blockers: string[] = [];

    // 활성 구독 확인
    const [activeSub] = await this.db
      .select()
      .from(subscriptions)
      .where(and(
        eq(subscriptions.userId, userId),
        or(
          eq(subscriptions.status, 'active'),
          eq(subscriptions.status, 'past_due'),
        ),
      ))
      .limit(1);

    if (activeSub) {
      blockers.push('활성 구독을 먼저 해지해 주세요');
    }

    return { withdrawable: blockers.length === 0, blockers };
  }

  async withdraw(userId: string, input: WithdrawInput) {
    const { withdrawable, blockers } = await this.checkWithdrawable(userId);
    if (!withdrawable) {
      throw new BadRequestException(blockers.join(', '));
    }

    const profile = await this.getProfile(userId);
    if (profile.deletedAt) {
      throw new NotFoundException('이미 탈퇴된 계정입니다');
    }

    // TODO: 비밀번호 검증 (Supabase Auth 연동)

    await this.db.insert(profileWithdrawalReasons).values({
      userId,
      reasonType: input.reasonType,
      reasonDetail: input.reasonDetail,
    });

    await this.db
      .update(profiles)
      .set({
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, userId));

    logger.info('User withdrawn', {
      'profile.user_id': userId,
      'profile.withdrawal_reason': input.reasonType,
    });

    return { success: true };
  }

  async adminWithdrawalReasons(input: { page: number; limit: number; reasonType?: string }) {
    const { page, limit, reasonType } = input;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (reasonType) {
      conditions.push(eq(profileWithdrawalReasons.reasonType, reasonType as any));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(profileWithdrawalReasons)
        .where(whereClause)
        .orderBy(desc(profileWithdrawalReasons.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: count() }).from(profileWithdrawalReasons).where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
