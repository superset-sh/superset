jest.mock('drizzle-orm', () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: 'eq' })),
  asc: jest.fn((field: any) => ({ field, type: 'asc' })),
}));

jest.mock('@superbuilder/drizzle', () => {
  const { Inject } = require('@nestjs/common');
  return {
    DRIZZLE: 'DRIZZLE_TOKEN',
    InjectDrizzle: () => Inject('DRIZZLE_TOKEN'),
    paymentPlans: {
      id: { name: 'id' },
      slug: { name: 'slug' },
      name: { name: 'name' },
      isActive: { name: 'is_active' },
      sortOrder: { name: 'sort_order' },
      providerVariantId: { name: 'provider_variant_id' },
    },
    paymentCreditBalances: {
      userId: { name: 'user_id' },
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
import { NotFoundException } from '@nestjs/common';
import { PlanService } from './plan.service';
import { DRIZZLE } from '@superbuilder/drizzle';
import {
  createMockDb,
  createMockProvider,
  TEST_PLAN,
  TEST_FREE_PLAN,
  TEST_USER,
  TEST_CREDIT_BALANCE,
} from '../__test-utils__';

describe('PlanService', () => {
  let service: PlanService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<PlanService>(PlanService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // getPlans
  // ============================================================================
  describe('getPlans', () => {
    it('활성 플랜 목록을 정렬하여 반환한다', async () => {
      mockDb.query.paymentPlans.findMany.mockResolvedValue([TEST_FREE_PLAN, TEST_PLAN]);

      const result = await service.getPlans();

      expect(result).toEqual([TEST_FREE_PLAN, TEST_PLAN]);
      expect(mockDb.query.paymentPlans.findMany).toHaveBeenCalled();
    });

    it('활성 플랜이 없으면 빈 배열을 반환한다', async () => {
      mockDb.query.paymentPlans.findMany.mockResolvedValue([]);

      const result = await service.getPlans();

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // getAllPlans
  // ============================================================================
  describe('getAllPlans', () => {
    it('비활성 포함 전체 플랜을 반환한다', async () => {
      const inactivePlan = { ...TEST_PLAN, isActive: false };
      mockDb.query.paymentPlans.findMany.mockResolvedValue([TEST_FREE_PLAN, TEST_PLAN, inactivePlan]);

      const result = await service.getAllPlans();

      expect(result).toHaveLength(3);
    });
  });

  // ============================================================================
  // getPlanById
  // ============================================================================
  describe('getPlanById', () => {
    it('ID로 플랜을 조회한다', async () => {
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(TEST_PLAN);

      const result = await service.getPlanById(TEST_PLAN.id);

      expect(result).toEqual(TEST_PLAN);
    });

    it('존재하지 않는 플랜이면 NotFoundException을 던진다', async () => {
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(null);

      await expect(service.getPlanById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // createPlan
  // ============================================================================
  describe('createPlan', () => {
    it('새 플랜을 생성한다', async () => {
      mockDb._queueResolve('returning', [TEST_PLAN]);

      const result = await service.createPlan({
        name: 'Pro Plan',
        slug: 'pro',
        tier: 'pro',
        monthlyCredits: 10000,
        price: 29,
        currency: 'USD',
        interval: 'month',
      });

      expect(result).toEqual(TEST_PLAN);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // updatePlan
  // ============================================================================
  describe('updatePlan', () => {
    it('플랜을 수정한다', async () => {
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(TEST_PLAN);
      const updated = { ...TEST_PLAN, name: 'Pro Plan Updated' };
      mockDb._queueResolve('returning', [updated]);

      const result = await service.updatePlan(TEST_PLAN.id, { name: 'Pro Plan Updated' });

      expect(result?.name).toBe('Pro Plan Updated');
    });

    it('존재하지 않는 플랜 수정 시 NotFoundException을 던진다', async () => {
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(null);

      await expect(service.updatePlan('non-existent', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================================================
  // seedFreePlan
  // ============================================================================
  describe('seedFreePlan', () => {
    it('Free 플랜이 없으면 생성한다', async () => {
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(null);
      mockDb._queueResolve('returning', [TEST_FREE_PLAN]);

      const result = await service.seedFreePlan();

      expect(result.created).toBe(true);
      expect(result.plan).toEqual(TEST_FREE_PLAN);
    });

    it('Free 플랜이 이미 있으면 스킵한다', async () => {
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(TEST_FREE_PLAN);

      const result = await service.seedFreePlan();

      expect(result.created).toBe(false);
      expect(result.plan).toEqual(TEST_FREE_PLAN);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // seedEnterprisePlan
  // ============================================================================
  describe('seedEnterprisePlan', () => {
    it('Enterprise 플랜이 없으면 생성한다', async () => {
      const enterprisePlan = {
        ...TEST_PLAN,
        id: 'plan-enterprise',
        name: 'Enterprise',
        slug: 'enterprise',
        tier: 'enterprise',
      };
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(null);
      mockDb._queueResolve('returning', [enterprisePlan]);

      const result = await service.seedEnterprisePlan();

      expect(result.created).toBe(true);
    });

    it('Enterprise 플랜이 이미 있으면 스킵한다', async () => {
      const enterprisePlan = {
        ...TEST_PLAN,
        slug: 'enterprise',
        tier: 'enterprise',
      };
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(enterprisePlan);

      const result = await service.seedEnterprisePlan();

      expect(result.created).toBe(false);
    });
  });

  // ============================================================================
  // assignPlanToUser
  // ============================================================================
  describe('assignPlanToUser', () => {
    it('사용자에게 플랜을 할당한다', async () => {
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(TEST_PLAN);
      mockDb._queueResolve('returning', [TEST_CREDIT_BALANCE]);

      const result = await service.assignPlanToUser(TEST_USER.id, TEST_PLAN.id);

      expect(result).toEqual(TEST_CREDIT_BALANCE);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });

    it('존재하지 않는 플랜 할당 시 NotFoundException을 던진다', async () => {
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(null);

      await expect(
        service.assignPlanToUser(TEST_USER.id, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // syncPlansFromProvider
  // ============================================================================
  describe('syncPlansFromProvider', () => {
    it('프로바이더 상품을 플랜으로 동기화한다 (기존 매칭)', async () => {
      const provider = createMockProvider('polar');
      provider.getProducts.mockResolvedValue([
        { externalId: 'prod-1', name: 'Pro Plan', description: '' },
      ]);
      provider.getStoreCurrency.mockResolvedValue('USD');
      provider.getVariants.mockResolvedValue([
        { externalId: 'var-1', name: 'Monthly', price: 2900, interval: 'month', sort: 1 },
      ]);
      provider.getVariantPriceModel.mockResolvedValue({
        scheme: 'flat',
        unitPrice: 2900,
        renewalIntervalUnit: 'month',
      });

      // variant ID로 기존 플랜 매칭
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(TEST_PLAN);
      // allPlans for deletion check
      mockDb.query.paymentPlans.findMany.mockResolvedValue([TEST_PLAN]);

      const result = await service.syncPlansFromProvider(provider);

      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
    });

    it('프로바이더 새 상품을 플랜으로 생성한다', async () => {
      const provider = createMockProvider('polar');
      provider.getProducts.mockResolvedValue([
        { externalId: 'prod-new', name: 'Team Plan', description: '' },
      ]);
      provider.getStoreCurrency.mockResolvedValue('USD');
      provider.getVariants.mockResolvedValue([
        { externalId: 'var-new', name: 'Monthly', price: 9900, interval: 'month', sort: 2 },
      ]);
      provider.getVariantPriceModel.mockResolvedValue(null);

      // variant ID / product name 둘 다 매칭 실패
      mockDb.query.paymentPlans.findFirst
        .mockResolvedValueOnce(null)   // by variant ID
        .mockResolvedValueOnce(null);  // by product name
      // insert().returning() for new plan
      mockDb._queueResolve('returning', [{ id: 'plan-new', slug: 'team-plan' }]);
      // allPlans for deletion check
      mockDb.query.paymentPlans.findMany.mockResolvedValue([]);

      const result = await service.syncPlansFromProvider(provider);

      expect(result.created).toBe(1);
    });

    it('프로바이더에 없는 유료 플랜을 삭제한다 (Free 보호)', async () => {
      const provider = createMockProvider('polar');
      provider.getProducts.mockResolvedValue([]);
      provider.getStoreCurrency.mockResolvedValue('USD');

      // allPlans: free(보호) + 유료(삭제 대상)
      const orphanPlan = {
        ...TEST_PLAN,
        id: 'plan-orphan',
        slug: 'orphan',
        providerVariantId: 'var-orphan',
      };
      mockDb.query.paymentPlans.findMany.mockResolvedValue([
        { ...TEST_FREE_PLAN, providerVariantId: null },
        orphanPlan,
      ]);

      const result = await service.syncPlansFromProvider(provider);

      expect(result.deleted).toBe(1);
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // pushPlansToProvider
  // ============================================================================
  describe('pushPlansToProvider', () => {
    it('연동된 유료 플랜을 프로바이더에 푸시한다', async () => {
      const provider = createMockProvider('polar');
      provider.updateVariant = jest.fn().mockResolvedValue(undefined);

      mockDb.query.paymentPlans.findMany.mockResolvedValue([
        { ...TEST_PLAN, providerVariantId: 'var-1' },
      ]);

      const result = await service.pushPlansToProvider(provider);

      expect(result.updated).toBe(1);
      expect(provider.updateVariant).toHaveBeenCalled();
    });

    it('Free 플랜(price=0)은 스킵한다', async () => {
      const provider = createMockProvider('polar');
      provider.updateVariant = jest.fn();

      mockDb.query.paymentPlans.findMany.mockResolvedValue([TEST_FREE_PLAN]);

      const result = await service.pushPlansToProvider(provider);

      expect(result.skipped).toBe(1);
      expect(provider.updateVariant).not.toHaveBeenCalled();
    });

    it('provider 미연동 플랜은 notLinked로 분류한다', async () => {
      const provider = createMockProvider('polar');
      provider.updateVariant = jest.fn();

      mockDb.query.paymentPlans.findMany.mockResolvedValue([
        { ...TEST_PLAN, providerVariantId: null },
      ]);

      const result = await service.pushPlansToProvider(provider);

      expect(result.notLinked).toBe(1);
    });
  });
});
