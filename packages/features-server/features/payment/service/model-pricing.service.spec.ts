jest.mock('drizzle-orm', () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: 'eq' })),
}));

jest.mock('@superbuilder/drizzle', () => {
  const { Inject } = require('@nestjs/common');
  return {
    DRIZZLE: 'DRIZZLE_TOKEN',
    InjectDrizzle: () => Inject('DRIZZLE_TOKEN'),
    paymentModelPricing: {
    id: { name: 'id' },
    modelId: { name: 'model_id' },
    provider: { name: 'provider' },
    displayName: { name: 'display_name' },
    inputCreditsPerKToken: { name: 'input_credits_per_k_token' },
    outputCreditsPerKToken: { name: 'output_credits_per_k_token' },
    isActive: { name: 'is_active' },
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
import { ModelPricingService } from './model-pricing.service';
import { DRIZZLE } from '@superbuilder/drizzle';
import { createMockDb, TEST_MODEL_PRICING } from '../__test-utils__';

describe('ModelPricingService', () => {
  let service: ModelPricingService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelPricingService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<ModelPricingService>(ModelPricingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  describe('getPricingList', () => {
    it('활성 모델 가격 목록을 반환한다', async () => {
      mockDb.query.paymentModelPricing.findMany.mockResolvedValue([TEST_MODEL_PRICING]);

      const result = await service.getPricingList();

      expect(result).toEqual([TEST_MODEL_PRICING]);
      expect(mockDb.query.paymentModelPricing.findMany).toHaveBeenCalled();
    });

    it('활성 모델이 없으면 빈 배열을 반환한다', async () => {
      mockDb.query.paymentModelPricing.findMany.mockResolvedValue([]);

      const result = await service.getPricingList();

      expect(result).toEqual([]);
    });
  });

  describe('upsertPricing', () => {
    const baseInput = {
      modelId: 'gpt-4',
      provider: 'openai',
      displayName: 'GPT-4',
      inputCreditsPerKToken: 10,
      outputCreditsPerKToken: 30,
      isActive: true,
    };

    it('새 모델 가격을 생성한다', async () => {
      mockDb._queueResolve('returning', [TEST_MODEL_PRICING]);

      const result = await service.upsertPricing(baseInput);

      expect(result).toEqual(TEST_MODEL_PRICING);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('기존 모델 가격을 업데이트한다 (onConflict)', async () => {
      const updated = { ...TEST_MODEL_PRICING, displayName: 'GPT-4 Updated' };
      mockDb._queueResolve('returning', [updated]);

      const result = await service.upsertPricing({
        ...baseInput,
        displayName: 'GPT-4 Updated',
      });

      expect(result).toEqual(updated);
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });

    it('비활성 모델 가격을 설정할 수 있다', async () => {
      const inactive = { ...TEST_MODEL_PRICING, isActive: false };
      mockDb._queueResolve('returning', [inactive]);

      const result = await service.upsertPricing({ ...baseInput, isActive: false });

      expect(result?.isActive).toBe(false);
    });

    it('반환 결과가 없으면 undefined를 반환한다', async () => {
      mockDb._queueResolve('returning', []);

      const result = await service.upsertPricing(baseInput);

      expect(result).toBeUndefined();
    });
  });
});
