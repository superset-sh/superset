jest.mock('drizzle-orm', () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: 'eq' })),
}));

jest.mock('@superbuilder/drizzle', () => {
  const { Inject } = require('@nestjs/common');
  return {
    DRIZZLE: 'DRIZZLE_TOKEN',
    InjectDrizzle: () => Inject('DRIZZLE_TOKEN'),
    subscriptions: { externalId: { name: 'external_id' }, provider: { name: 'provider' } },
    orders: { externalId: { name: 'external_id' } },
    licenses: { key: { name: 'key' } },
    webhookEvents: { eventId: { name: 'event_id' } },
    profiles: { email: { name: 'email' } },
    products: { externalId: { name: 'external_id' } },
    paymentPlans: { providerVariantId: { name: 'provider_variant_id' } },
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
import { WebhookService } from './webhook.service';
import { DRIZZLE } from '@superbuilder/drizzle';
import { createMockDb, TEST_USER, TEST_PLAN } from '../__test-utils__';
import type { NormalizedWebhookEvent } from '../types/normalized.types';

describe('WebhookService', () => {
  let service: WebhookService;
  let mockDb: ReturnType<typeof createMockDb>;

  const mockPlanService = {
    assignPlanToUser: jest.fn().mockResolvedValue(undefined),
    getPlanById: jest.fn().mockResolvedValue(TEST_PLAN),
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    service.setPlanService(mockPlanService as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  const makeEvent = (
    eventType: string,
    data: Record<string, unknown> = {},
    customData?: Record<string, string>,
  ): NormalizedWebhookEvent => ({
    eventType: eventType as any,
    externalId: 'ext-001',
    data,
    customData,
    testMode: false,
  });

  // ============================================================================
  // handleWebhook — subscription events
  // ============================================================================
  describe('handleWebhook — subscription_created/updated', () => {
    const subData = {
      customerEmail: TEST_USER.email,
      customerName: TEST_USER.name,
      status: 'active',
      statusFormatted: 'Active',
      variantExternalId: 'ext-var-001',
      productExternalId: 'ext-prod-001',
      price: 29,
      currency: 'USD',
      interval: 'month',
      renewsAt: '2026-03-01',
      endsAt: null,
      trialEndsAt: null,
      billingAnchor: null,
      firstSubscriptionItemId: null,
      testMode: false,
      urls: {},
    };

    it('subscription_created 이벤트를 처리한다', async () => {
      const event = makeEvent('subscription_created', subData, { user_id: TEST_USER.id });

      // paymentPlans 매칭
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(TEST_PLAN);
      // products 매칭
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'prod-db-001' });

      await service.handleWebhook(event, 'polar');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockPlanService.assignPlanToUser).toHaveBeenCalledWith(TEST_USER.id, TEST_PLAN.id);
    });

    it('subscription_updated 이벤트를 처리한다', async () => {
      const event = makeEvent('subscription_updated', subData, { user_id: TEST_USER.id });
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(TEST_PLAN);
      mockDb.query.products.findFirst.mockResolvedValue(null);

      await service.handleWebhook(event, 'polar');

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('userId 없으면 구독 처리를 스킵한다', async () => {
      const event = makeEvent('subscription_created', {
        ...subData,
        customerEmail: 'unknown@test.com',
      });
      mockDb.query.profiles.findFirst.mockResolvedValue(null);

      await service.handleWebhook(event, 'polar');

      // insert는 webhookEvents 저장만, subscription insert는 안 됨
      expect(mockPlanService.assignPlanToUser).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // handleWebhook — subscription cancellation/pause/resume
  // ============================================================================
  describe('handleWebhook — subscription lifecycle', () => {
    it('subscription_cancelled 이벤트를 처리한다', async () => {
      const event = makeEvent('subscription_cancelled');

      await service.handleWebhook(event, 'polar');

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('subscription_paused 이벤트를 처리한다', async () => {
      const event = makeEvent('subscription_paused');

      await service.handleWebhook(event, 'polar');

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('subscription_resumed 이벤트를 처리한다', async () => {
      const event = makeEvent('subscription_resumed');

      await service.handleWebhook(event, 'polar');

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // handleWebhook — order events
  // ============================================================================
  describe('handleWebhook — order_created', () => {
    const orderData = {
      orderNumber: 'ORD-001',
      customerEmail: TEST_USER.email,
      customerName: TEST_USER.name,
      status: 'paid',
      statusFormatted: 'Paid',
      subtotal: 2900,
      discount: 0,
      tax: 0,
      total: 2900,
      currency: 'USD',
      testMode: false,
      urls: {},
    };

    it('order_created 이벤트를 처리한다', async () => {
      const event = makeEvent('order_created', orderData, { user_id: TEST_USER.id });

      await service.handleWebhook(event, 'polar');

      // webhookEvents insert + orders insert = 2 calls
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('userId 없이도 주문을 생성한다', async () => {
      const event = makeEvent('order_created', {
        ...orderData,
        customerEmail: 'unknown@test.com',
      });
      mockDb.query.profiles.findFirst.mockResolvedValue(null);

      await service.handleWebhook(event, 'polar');

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('handleWebhook — order_refunded', () => {
    it('order_refunded 이벤트를 처리한다', async () => {
      const event = makeEvent('order_refunded');

      await service.handleWebhook(event, 'polar');

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // handleWebhook — license events
  // ============================================================================
  describe('handleWebhook — license_key_created', () => {
    it('license_key_created 이벤트를 처리한다', async () => {
      const licenseData = {
        key: 'LICENSE-KEY-001',
        status: 'granted',
        statusFormatted: 'Granted',
        activationLimit: 5,
        activationUsage: 0,
        expiresAt: null,
        testMode: false,
      };
      const event = makeEvent('license_key_created', licenseData);

      await service.handleWebhook(event, 'polar');

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // handleWebhook — unknown event
  // ============================================================================
  describe('handleWebhook — unknown event', () => {
    it('알 수 없는 이벤트는 경고 로그만 남긴다', async () => {
      const event = makeEvent('unknown_event_type');

      await service.handleWebhook(event, 'polar');

      // webhookEvents insert + update(processed) = 정상 완료
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // handleWebhook — error handling
  // ============================================================================
  describe('handleWebhook — error handling', () => {
    it('이벤트 처리 중 에러 발생 시 에러를 기록하고 re-throw한다', async () => {
      const event = makeEvent('subscription_created', {
        customerEmail: TEST_USER.email,
        variantExternalId: 'var-1',
        productExternalId: 'prod-1',
        renewsAt: '2026-03-01',
        status: 'active',
        statusFormatted: 'Active',
      }, { user_id: TEST_USER.id });

      // paymentPlans 조회에서 에러 발생 시뮬레이션
      mockDb.query.paymentPlans.findFirst.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.handleWebhook(event, 'polar')).rejects.toThrow('DB connection lost');
    });
  });

  // ============================================================================
  // resolveUserId
  // ============================================================================
  describe('resolveUserId (via subscription event)', () => {
    const subData = {
      customerEmail: TEST_USER.email,
      customerName: TEST_USER.name,
      status: 'active',
      statusFormatted: 'Active',
      variantExternalId: 'ext-var-001',
      productExternalId: 'ext-prod-001',
      renewsAt: '2026-03-01',
      endsAt: null,
      trialEndsAt: null,
      billingAnchor: null,
      firstSubscriptionItemId: null,
      testMode: false,
      urls: {},
    };

    it('customData에서 user_id를 추출한다', async () => {
      const event = makeEvent('subscription_created', subData, { user_id: TEST_USER.id });
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(null);
      mockDb.query.products.findFirst.mockResolvedValue(null);

      await service.handleWebhook(event, 'polar');

      // subscription이 userId로 insert되어야 함
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('이메일로 profiles에서 userId를 조회한다', async () => {
      const event = makeEvent('subscription_created', subData);
      mockDb.query.profiles.findFirst.mockResolvedValue({ id: TEST_USER.id });
      mockDb.query.paymentPlans.findFirst.mockResolvedValue(null);
      mockDb.query.products.findFirst.mockResolvedValue(null);

      await service.handleWebhook(event, 'polar');

      expect(mockDb.query.profiles.findFirst).toHaveBeenCalled();
    });
  });
});
