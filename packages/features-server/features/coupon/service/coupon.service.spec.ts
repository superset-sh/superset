jest.mock('drizzle-orm', () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: 'eq' })),
  and: jest.fn((...conditions: any[]) => ({ conditions, type: 'and' })),
  desc: jest.fn((field: any) => ({ field, type: 'desc' })),
  sql: jest.fn((strings: any, ...values: any[]) => ({
    strings,
    values,
    type: 'sql',
  })),
  count: jest.fn(() => ({ type: 'count' })),
}));

jest.mock('@superbuilder/drizzle', () => {
  const { Inject } = require('@nestjs/common');
  return {
    DRIZZLE: 'DRIZZLE_TOKEN',
    InjectDrizzle: () => Inject('DRIZZLE_TOKEN'),
    paymentCoupons: {
      id: { name: 'id' },
      code: { name: 'code' },
      name: { name: 'name' },
      description: { name: 'description' },
      discountPercent: { name: 'discount_percent' },
      durationMonths: { name: 'duration_months' },
      applicablePlans: { name: 'applicable_plans' },
      currentRedemptions: { name: 'current_redemptions' },
      maxRedemptions: { name: 'max_redemptions' },
      startsAt: { name: 'starts_at' },
      expiresAt: { name: 'expires_at' },
      isActive: { name: 'is_active' },
      isDeleted: { name: 'is_deleted' },
      createdAt: { name: 'created_at' },
      updatedAt: { name: 'updated_at' },
      createdBy: { name: 'created_by' },
    },
    paymentCouponRedemptions: {
      id: { name: 'id' },
      couponId: { name: 'coupon_id' },
      userId: { name: 'user_id' },
      subscriptionId: { name: 'subscription_id' },
      status: { name: 'status' },
      discountPercent: { name: 'discount_percent' },
      appliedAt: { name: 'applied_at' },
      expiresAt: { name: 'expires_at' },
      createdAt: { name: 'created_at' },
      updatedAt: { name: 'updated_at' },
    },
  };
});

jest.mock('@/core/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { Test, type TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CouponService } from './coupon.service';
import { DRIZZLE } from '@superbuilder/drizzle';
import {
  createMockDb,
  TEST_USER,
  TEST_ADMIN,
  TEST_IDS,
  TEST_DATES,
} from '../../__test-utils__';

describe('CouponService', () => {
  let service: CouponService;
  let mockDb: ReturnType<typeof createMockDb>;

  const mockCoupon = {
    id: TEST_IDS.UUID_1,
    code: 'WELCOME30',
    name: 'Welcome 30%',
    description: null,
    discountPercent: 30,
    durationMonths: 3,
    applicablePlans: null,
    maxRedemptions: 100,
    currentRedemptions: 5,
    startsAt: new Date('2026-01-01'),
    expiresAt: new Date('2026-12-31'),
    isActive: true,
    isDeleted: false,
    createdBy: TEST_ADMIN.id,
    createdAt: TEST_DATES.CREATED,
    updatedAt: TEST_DATES.UPDATED,
  };

  const mockRedemption = {
    id: TEST_IDS.UUID_2,
    couponId: TEST_IDS.UUID_1,
    userId: TEST_USER.id,
    subscriptionId: TEST_IDS.UUID_3,
    discountPercent: 30,
    appliedAt: TEST_DATES.CREATED,
    expiresAt: new Date('2027-06-01'),
    status: 'active' as const,
    createdAt: TEST_DATES.CREATED,
    updatedAt: TEST_DATES.UPDATED,
  };

  const mockCreateInput = {
    code: 'WELCOME30',
    name: 'Welcome 30%',
    discountPercent: 30,
    durationMonths: 3,
    startsAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-12-31T00:00:00.000Z',
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<CouponService>(CouponService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    it('쿠폰을 생성한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(null);
      mockDb._queueResolve('returning', [mockCoupon]);

      const result = await service.create(mockCreateInput, TEST_ADMIN.id);

      expect(result).toEqual(mockCoupon);
      expect(mockDb.query.paymentCoupons.findFirst).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('expiresAt 없이도 쿠폰을 생성한다', async () => {
      const inputWithoutExpiry = { ...mockCreateInput, expiresAt: undefined };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(null);
      mockDb._queueResolve('returning', [
        { ...mockCoupon, expiresAt: null },
      ]);

      const result = await service.create(inputWithoutExpiry, TEST_ADMIN.id);

      expect(result.expiresAt).toBeNull();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('중복 코드 시 ConflictException을 던진다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(mockCoupon);

      await expect(
        service.create(mockCreateInput, TEST_ADMIN.id),
      ).rejects.toThrow(ConflictException);
    });

    it('중복 코드 시 구체적인 에러 메시지를 포함한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(mockCoupon);

      await expect(
        service.create(mockCreateInput, TEST_ADMIN.id),
      ).rejects.toThrow('이미 존재하는 쿠폰 코드입니다');
    });
  });

  // =========================================================================
  // list
  // =========================================================================
  describe('list', () => {
    it('페이지네이션 결과를 반환한다', async () => {
      mockDb.query.paymentCoupons.findMany.mockResolvedValue([mockCoupon]);
      mockDb._queueResolve('where', [{ count: 1 }]);

      const result = await service.list(1, 20);

      expect(result).toEqual({
        data: [mockCoupon],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('빈 목록을 반환한다', async () => {
      mockDb.query.paymentCoupons.findMany.mockResolvedValue([]);
      mockDb._queueResolve('where', [{ count: 0 }]);

      const result = await service.list(1, 20);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('기본값으로 page=1, limit=20을 사용한다', async () => {
      mockDb.query.paymentCoupons.findMany.mockResolvedValue([]);
      mockDb._queueResolve('where', [{ count: 0 }]);

      const result = await service.list();

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('여러 페이지일 때 totalPages를 올바르게 계산한다', async () => {
      mockDb.query.paymentCoupons.findMany.mockResolvedValue([mockCoupon]);
      mockDb._queueResolve('where', [{ count: 45 }]);

      const result = await service.list(1, 20);

      expect(result.totalPages).toBe(3);
    });

    it('totalResult가 비어있으면 total을 0으로 처리한다', async () => {
      mockDb.query.paymentCoupons.findMany.mockResolvedValue([]);
      mockDb._queueResolve('where', []);

      const result = await service.list(1, 20);

      expect(result.total).toBe(0);
    });
  });

  // =========================================================================
  // getById
  // =========================================================================
  describe('getById', () => {
    it('쿠폰을 반환한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(mockCoupon);

      const result = await service.getById(TEST_IDS.UUID_1);

      expect(result).toEqual(mockCoupon);
      expect(mockDb.query.paymentCoupons.findFirst).toHaveBeenCalled();
    });

    it('존재하지 않는 쿠폰 조회 시 NotFoundException을 던진다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(null);

      await expect(service.getById('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('NotFoundException에 구체적인 메시지를 포함한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(null);

      await expect(service.getById('nonexistent-id')).rejects.toThrow(
        '쿠폰을 찾을 수 없습니다',
      );
    });
  });

  // =========================================================================
  // getByIdWithRedemptions
  // =========================================================================
  describe('getByIdWithRedemptions', () => {
    it('쿠폰과 redemptions 배열을 반환한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(mockCoupon);
      mockDb.query.paymentCouponRedemptions.findMany.mockResolvedValue([
        mockRedemption,
      ]);

      const result = await service.getByIdWithRedemptions(TEST_IDS.UUID_1);

      expect(result).toEqual({ ...mockCoupon, redemptions: [mockRedemption] });
      expect(
        mockDb.query.paymentCouponRedemptions.findMany,
      ).toHaveBeenCalled();
    });

    it('redemptions가 없으면 빈 배열을 반환한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(mockCoupon);
      mockDb.query.paymentCouponRedemptions.findMany.mockResolvedValue([]);

      const result = await service.getByIdWithRedemptions(TEST_IDS.UUID_1);

      expect(result.redemptions).toEqual([]);
    });

    it('쿠폰이 없으면 NotFoundException을 던진다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(null);

      await expect(
        service.getByIdWithRedemptions('nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe('update', () => {
    it('쿠폰을 수정하고 반환한다', async () => {
      const updatedCoupon = { ...mockCoupon, name: 'Updated Name' };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(mockCoupon);
      mockDb._queueResolve('returning', [updatedCoupon]);

      const result = await service.update(TEST_IDS.UUID_1, {
        name: 'Updated Name',
      });

      expect(result).toEqual(updatedCoupon);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('expiresAt가 있으면 Date로 변환한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(mockCoupon);
      mockDb._queueResolve('returning', [mockCoupon]);

      await service.update(TEST_IDS.UUID_1, {
        expiresAt: '2027-12-31T00:00:00.000Z',
      });

      expect(mockDb.set).toHaveBeenCalled();
    });

    it('expiresAt가 없으면 undefined로 처리한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(mockCoupon);
      mockDb._queueResolve('returning', [mockCoupon]);

      await service.update(TEST_IDS.UUID_1, { name: 'No Expiry Change' });

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('존재하지 않는 쿠폰 수정 시 NotFoundException을 던진다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent-id', { name: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // deactivate
  // =========================================================================
  describe('deactivate', () => {
    it('쿠폰을 비활성화한다', async () => {
      const deactivated = { ...mockCoupon, isActive: false };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(mockCoupon);
      mockDb._queueResolve('returning', [deactivated]);

      const result = await service.deactivate(TEST_IDS.UUID_1);

      expect(result.isActive).toBe(false);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('존재하지 않는 쿠폰 비활성화 시 NotFoundException을 던진다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // softDelete
  // =========================================================================
  describe('softDelete', () => {
    it('쿠폰을 소프트 삭제하고 success를 반환한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(mockCoupon);

      const result = await service.softDelete(TEST_IDS.UUID_1);

      expect(result).toEqual({ success: true });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('존재하지 않는 쿠폰 삭제 시 NotFoundException을 던진다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(null);

      await expect(service.softDelete('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // validate
  // =========================================================================
  describe('validate', () => {
    it('유효한 쿠폰에 대해 valid=true를 반환한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(mockCoupon);
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(null);

      const result = await service.validate(
        { code: 'WELCOME30' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(true);
      expect(result.coupon).toEqual(mockCoupon);
      expect(result.discountPercent).toBe(30);
      expect(result.durationMonths).toBe(3);
    });

    it('존재하지 않는 코드에 대해 에러를 반환한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(null);

      const result = await service.validate(
        { code: 'INVALID' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('유효하지 않은 쿠폰 코드입니다');
    });

    it('비활성 쿠폰에 대해 에러를 반환한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue({
        ...mockCoupon,
        isActive: false,
      });

      const result = await service.validate(
        { code: 'WELCOME30' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('사용할 수 없는 쿠폰입니다');
    });

    it('삭제된 쿠폰에 대해 에러를 반환한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue({
        ...mockCoupon,
        isDeleted: true,
      });

      const result = await service.validate(
        { code: 'WELCOME30' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('사용할 수 없는 쿠폰입니다');
    });

    it('시작 전 쿠폰에 대해 에러를 반환한다', async () => {
      const futureCoupon = {
        ...mockCoupon,
        startsAt: new Date('2099-01-01'),
      };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(futureCoupon);

      const result = await service.validate(
        { code: 'WELCOME30' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('아직 사용할 수 없는 쿠폰입니다');
    });

    it('만료된 쿠폰에 대해 에러를 반환한다', async () => {
      const expiredCoupon = {
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
        expiresAt: new Date('2020-12-31'),
      };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(expiredCoupon);

      const result = await service.validate(
        { code: 'WELCOME30' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('만료된 쿠폰입니다');
    });

    it('expiresAt이 null이면 만료 검사를 건너뛴다', async () => {
      const noExpiryCoupon = {
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
        expiresAt: null,
      };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(noExpiryCoupon);
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(null);

      const result = await service.validate(
        { code: 'WELCOME30' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(true);
    });

    it('최대 사용 횟수에 도달한 쿠폰에 대해 에러를 반환한다', async () => {
      const maxedCoupon = {
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
        maxRedemptions: 100,
        currentRedemptions: 100,
      };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(maxedCoupon);

      const result = await service.validate(
        { code: 'WELCOME30' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('쿠폰 사용 한도에 도달했습니다');
    });

    it('maxRedemptions가 null이면 한도 검사를 건너뛴다', async () => {
      const unlimitedCoupon = {
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
        maxRedemptions: null,
        currentRedemptions: 9999,
      };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(unlimitedCoupon);
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(null);

      const result = await service.validate(
        { code: 'WELCOME30' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(true);
    });

    it('이미 사용한 사용자에게 에러를 반환한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue({
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
      });
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(
        mockRedemption,
      );

      const result = await service.validate(
        { code: 'WELCOME30' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('이미 사용한 쿠폰입니다');
    });

    it('호환되지 않는 플랜에 대해 에러를 반환한다', async () => {
      const planRestrictedCoupon = {
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
        applicablePlans: ['plan-pro', 'plan-enterprise'],
      };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(
        planRestrictedCoupon,
      );
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(null);

      const result = await service.validate(
        { code: 'WELCOME30', planId: 'plan-basic' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('현재 플랜에는 적용할 수 없는 쿠폰입니다');
    });

    it('호환되는 플랜에 대해 valid=true를 반환한다', async () => {
      const planRestrictedCoupon = {
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
        applicablePlans: ['plan-pro', 'plan-enterprise'],
      };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(
        planRestrictedCoupon,
      );
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(null);

      const result = await service.validate(
        { code: 'WELCOME30', planId: 'plan-pro' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(true);
    });

    it('planId가 없으면 플랜 검사를 건너뛴다', async () => {
      const planRestrictedCoupon = {
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
        applicablePlans: ['plan-pro'],
      };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(
        planRestrictedCoupon,
      );
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(null);

      const result = await service.validate(
        { code: 'WELCOME30' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(true);
    });

    it('applicablePlans가 빈 배열이면 플랜 검사를 건너뛴다', async () => {
      const emptyPlansCoupon = {
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
        applicablePlans: [],
      };
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(
        emptyPlansCoupon,
      );
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(null);

      const result = await service.validate(
        { code: 'WELCOME30', planId: 'any-plan' },
        TEST_USER.id,
      );

      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // apply
  // =========================================================================
  describe('apply', () => {
    const applyInput = {
      code: 'WELCOME30',
      subscriptionId: TEST_IDS.UUID_3,
    };

    it('쿠폰을 적용하고 redemption을 반환한다', async () => {
      // validate: coupon found, active, not expired, no existing redemption
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue({
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
      });
      // validate: no existing user redemption
      mockDb.query.paymentCouponRedemptions.findFirst
        .mockResolvedValueOnce(null)  // validate: user duplicate check
        .mockResolvedValueOnce(null); // apply: active subscription check

      mockDb._queueResolve('returning', [mockRedemption]);

      const result = await service.apply(applyInput, TEST_USER.id);

      expect(result).toEqual(mockRedemption);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('검증 실패 시 BadRequestException을 던진다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(null);

      await expect(
        service.apply(applyInput, TEST_USER.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('검증 실패 시 에러 메시지를 포함한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue(null);

      await expect(
        service.apply(applyInput, TEST_USER.id),
      ).rejects.toThrow('유효하지 않은 쿠폰 코드입니다');
    });

    it('구독에 이미 활성 쿠폰이 있으면 ConflictException을 던진다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue({
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
      });
      mockDb.query.paymentCouponRedemptions.findFirst
        .mockResolvedValueOnce(null)          // validate: user duplicate check
        .mockResolvedValueOnce(mockRedemption); // apply: active subscription check

      await expect(
        service.apply(applyInput, TEST_USER.id),
      ).rejects.toThrow(ConflictException);
    });

    it('구독에 이미 활성 쿠폰이 있으면 구체적인 에러 메시지를 포함한다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue({
        ...mockCoupon,
        startsAt: new Date('2020-01-01'),
      });
      mockDb.query.paymentCouponRedemptions.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockRedemption);

      await expect(
        service.apply(applyInput, TEST_USER.id),
      ).rejects.toThrow('이미 적용 중인 쿠폰이 있습니다');
    });

    it('비활성 쿠폰 적용 시 BadRequestException을 던진다', async () => {
      mockDb.query.paymentCoupons.findFirst.mockResolvedValue({
        ...mockCoupon,
        isActive: false,
      });

      await expect(
        service.apply(applyInput, TEST_USER.id),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // getMyRedemption
  // =========================================================================
  describe('getMyRedemption', () => {
    it('활성 redemption 목록을 반환한다', async () => {
      const futureRedemption = {
        ...mockRedemption,
        expiresAt: new Date('2099-12-31'),
      };
      mockDb.query.paymentCouponRedemptions.findMany.mockResolvedValue([
        futureRedemption,
      ]);

      const result = await service.getMyRedemption(TEST_USER.id);

      expect(result).toEqual([futureRedemption]);
    });

    it('만료된 redemption을 lazy expire 처리하고 결과에서 제외한다', async () => {
      const expiredRedemption = {
        ...mockRedemption,
        expiresAt: new Date('2020-01-01'),
      };
      mockDb.query.paymentCouponRedemptions.findMany.mockResolvedValue([
        expiredRedemption,
      ]);

      const result = await service.getMyRedemption(TEST_USER.id);

      expect(result).toHaveLength(0);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('활성과 만료 redemption을 혼합 처리한다', async () => {
      const activeRedemption = {
        ...mockRedemption,
        id: TEST_IDS.UUID_4,
        expiresAt: new Date('2099-12-31'),
      };
      const expiredRedemption = {
        ...mockRedemption,
        id: TEST_IDS.UUID_5,
        expiresAt: new Date('2020-01-01'),
      };
      mockDb.query.paymentCouponRedemptions.findMany.mockResolvedValue([
        activeRedemption,
        expiredRedemption,
      ]);

      const result = await service.getMyRedemption(TEST_USER.id);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(activeRedemption);
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('redemption이 없으면 빈 배열을 반환한다', async () => {
      mockDb.query.paymentCouponRedemptions.findMany.mockResolvedValue([]);

      const result = await service.getMyRedemption(TEST_USER.id);

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // cancel
  // =========================================================================
  describe('cancel', () => {
    it('redemption을 취소하고 success를 반환한다', async () => {
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(
        mockRedemption,
      );

      const result = await service.cancel(TEST_IDS.UUID_2, TEST_USER.id);

      expect(result).toEqual({ success: true });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('취소 시 currentRedemptions를 감소시킨다', async () => {
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(
        mockRedemption,
      );

      await service.cancel(TEST_IDS.UUID_2, TEST_USER.id);

      // update is called twice: once for status, once for currentRedemptions
      expect(mockDb.update).toHaveBeenCalledTimes(2);
    });

    it('활성 redemption이 없으면 NotFoundException을 던진다', async () => {
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(null);

      await expect(
        service.cancel('nonexistent-id', TEST_USER.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('NotFoundException에 구체적인 메시지를 포함한다', async () => {
      mockDb.query.paymentCouponRedemptions.findFirst.mockResolvedValue(null);

      await expect(
        service.cancel('nonexistent-id', TEST_USER.id),
      ).rejects.toThrow('활성 쿠폰을 찾을 수 없습니다');
    });
  });
});
