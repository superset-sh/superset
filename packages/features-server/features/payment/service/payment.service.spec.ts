jest.mock('drizzle-orm', () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: 'eq' })),
  and: jest.fn((...conds: any[]) => conds),
  desc: jest.fn((field: any) => ({ field, type: 'desc' })),
  count: jest.fn(() => ({ type: 'count' })),
  ilike: jest.fn((field: any, value: any) => ({ field, value, type: 'ilike' })),
  or: jest.fn((...conds: any[]) => ({ conditions: conds, type: 'or' })),
}));

jest.mock('@superbuilder/drizzle', () => {
  const { Inject } = require('@nestjs/common');
  return {
    DRIZZLE: 'DRIZZLE_TOKEN',
    InjectDrizzle: () => Inject('DRIZZLE_TOKEN'),
    products: {
      externalId: { name: 'external_id' },
      provider: { name: 'provider' },
      isActive: { name: 'is_active' },
      status: { name: 'status' },
      id: { name: 'id' },
      name: { name: 'name' },
      createdAt: { name: 'created_at' },
    },
    subscriptions: {
      userId: { name: 'user_id' },
      id: { name: 'id' },
      status: { name: 'status' },
      productId: { name: 'product_id' },
      createdAt: { name: 'created_at' },
      price: { name: 'price' },
      currency: { name: 'currency' },
      interval: { name: 'interval' },
      statusFormatted: { name: 'status_formatted' },
      endsAt: { name: 'ends_at' },
      provider: { name: 'provider' },
    },
    orders: {
      id: { name: 'id' },
      userId: { name: 'user_id' },
      status: { name: 'status' },
      createdAt: { name: 'created_at' },
      externalId: { name: 'external_id' },
    },
    licenses: {
      userId: { name: 'user_id' },
      key: { name: 'key' },
      status: { name: 'status' },
      createdAt: { name: 'created_at' },
    },
    webhookEvents: {
      eventName: { name: 'event_name' },
      processed: { name: 'processed' },
      createdAt: { name: 'created_at' },
    },
    profiles: {
      id: { name: 'id' },
      name: { name: 'name' },
      email: { name: 'email' },
      avatar: { name: 'avatar' },
    },
    paymentPlans: {
      price: { name: 'price' },
      currency: { name: 'currency' },
      interval: { name: 'interval' },
      isActive: { name: 'is_active' },
    },
    refundRequests: {
      id: { name: 'id' },
      userId: { name: 'user_id' },
      orderId: { name: 'order_id' },
      status: { name: 'status' },
      createdAt: { name: 'created_at' },
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

jest.mock('@/shared/utils/offset-pagination', () => ({
  buildPaginatedResult: jest.fn((data: any[], total: number, page: number, limit: number) => ({
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })),
}));

jest.mock('../provider/payment-provider.factory');

import { Test, type TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentProviderFactory } from '../provider/payment-provider.factory';
import { DRIZZLE } from '@superbuilder/drizzle';
import { createMockDb, createMockProvider, TEST_USER, TEST_PLAN } from '../__test-utils__';

// ============================================================================
// Test Data
// ============================================================================

const MOCK_PRODUCT = {
  id: 'prod-001',
  externalId: 'ext-prod-001',
  provider: 'polar',
  storeId: 'store-001',
  name: 'Pro Plan',
  description: 'Professional plan',
  status: 'published',
  price: 2900,
  currency: 'USD',
  isActive: true,
  createdAt: new Date('2026-01-01'),
};

const MOCK_SUBSCRIPTION = {
  id: 'sub-001',
  userId: TEST_USER.id,
  externalId: 'ext-sub-001',
  provider: 'polar',
  status: 'active',
  statusFormatted: 'Active',
  productId: 'prod-001',
  price: 2900,
  currency: 'USD',
  interval: 'month',
  endsAt: null,
  testMode: false,
  createdAt: new Date('2026-01-01'),
};

const MOCK_ORDER = {
  id: 'order-001',
  userId: TEST_USER.id,
  externalId: 'ext-order-001',
  provider: 'polar',
  status: 'paid',
  total: 2900,
  refunded: false,
  refundedAt: null,
  refundAmount: null,
  createdAt: new Date(),
};

const MOCK_LICENSE = {
  id: 'license-001',
  userId: TEST_USER.id,
  key: 'LICENSE-KEY-001',
  status: 'granted',
  createdAt: new Date('2026-01-01'),
};

const MOCK_REFUND_REQUEST = {
  id: 'refund-001',
  userId: TEST_USER.id,
  orderId: 'order-001',
  reasonType: 'not_satisfied',
  reasonDetail: 'Not what I expected',
  requestedAmount: 2900,
  status: 'pending',
  adminNote: null,
  processedBy: null,
  processedAt: null,
  createdAt: new Date(),
};

describe('PaymentService', () => {
  let service: PaymentService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockProvider: ReturnType<typeof createMockProvider>;
  let mockProviderFactory: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockDb = createMockDb();
    mockProvider = createMockProvider('polar');
    mockProviderFactory = {
      getActive: jest.fn().mockReturnValue(mockProvider),
      getByName: jest.fn().mockReturnValue(mockProvider),
      getActiveProviderName: jest.fn().mockReturnValue('polar'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: PaymentProviderFactory, useValue: mockProviderFactory },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // syncProducts
  // ============================================================================
  describe('syncProducts', () => {
    it('프로바이더 제품을 동기화한다', async () => {
      mockProvider.getProducts.mockResolvedValue([
        { externalId: 'prod-1', name: 'Pro', description: '', status: 'published', price: 2900, currency: 'USD' },
      ]);
      mockProvider.getVariants.mockResolvedValue([
        { isSubscription: true, interval: 'month', intervalCount: 1, hasLicenseKeys: false },
      ]);
      mockProvider.getStoreId.mockReturnValue('store-001');

      await service.syncProducts();

      expect(mockProvider.getProducts).toHaveBeenCalled();
      expect(mockProvider.getVariants).toHaveBeenCalledWith('prod-1');
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });

    it('빈 제품 목록일 때 정상 처리한다', async () => {
      mockProvider.getProducts.mockResolvedValue([]);

      await service.syncProducts();

      expect(mockProvider.getProducts).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getActiveProducts
  // ============================================================================
  describe('getActiveProducts', () => {
    it('활성 제품 목록을 반환한다', async () => {
      mockDb.query.products.findMany.mockResolvedValue([MOCK_PRODUCT]);

      const result = await service.getActiveProducts();

      expect(result).toEqual([MOCK_PRODUCT]);
      expect(mockDb.query.products.findMany).toHaveBeenCalled();
    });

    it('빈 목록을 반환한다', async () => {
      mockDb.query.products.findMany.mockResolvedValue([]);

      const result = await service.getActiveProducts();

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // createCheckout
  // ============================================================================
  describe('createCheckout', () => {
    const checkoutInput = {
      variantId: 'var-001',
      email: 'test@test.com',
      name: 'Test User',
    } as any;

    it('userId와 함께 체크아웃을 생성한다', async () => {
      mockProvider.getStoreId.mockReturnValue('store-001');
      mockProvider.createCheckout.mockResolvedValue({ checkoutUrl: 'https://checkout.test/123' });

      const result = await service.createCheckout(checkoutInput, TEST_USER.id);

      expect(result).toEqual({ checkoutUrl: 'https://checkout.test/123' });
      expect(mockProvider.createCheckout).toHaveBeenCalled();
    });

    it('userId 없이 체크아웃을 생성한다', async () => {
      mockProvider.getStoreId.mockReturnValue('store-001');
      mockProvider.createCheckout.mockResolvedValue({ checkoutUrl: 'https://checkout.test/456' });

      const result = await service.createCheckout(checkoutInput);

      expect(result).toEqual({ checkoutUrl: 'https://checkout.test/456' });
    });
  });

  // ============================================================================
  // getUserSubscription
  // ============================================================================
  describe('getUserSubscription', () => {
    it('productId로 제품 정보를 포함하여 반환한다', async () => {
      mockDb.query.subscriptions.findFirst.mockResolvedValue(MOCK_SUBSCRIPTION);
      mockDb.query.products.findFirst.mockResolvedValue(MOCK_PRODUCT);

      const result = await service.getUserSubscription(TEST_USER.id);

      expect(result).not.toBeNull();
      expect(result!.product).toBeDefined();
      expect(result!.product!.name).toBe('Pro Plan');
    });

    it('product 없으면 paymentPlans에서 매칭한다', async () => {
      mockDb.query.subscriptions.findFirst.mockResolvedValue(MOCK_SUBSCRIPTION);
      mockDb.query.products.findFirst.mockResolvedValue(null);
      mockDb.query.paymentPlans.findFirst.mockResolvedValue({
        id: TEST_PLAN.id,
        name: TEST_PLAN.name,
        description: 'Plan desc',
        price: 2900,
        currency: 'USD',
      });

      const result = await service.getUserSubscription(TEST_USER.id);

      expect(result).not.toBeNull();
      expect(result!.product).toBeDefined();
      expect(result!.product!.name).toBe(TEST_PLAN.name);
    });

    it('구독이 없으면 null을 반환한다', async () => {
      mockDb.query.subscriptions.findFirst.mockResolvedValue(null);

      const result = await service.getUserSubscription(TEST_USER.id);

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // getSubscriptions
  // ============================================================================
  describe('getSubscriptions', () => {
    it('필터와 함께 페이지네이션된 구독 목록을 반환한다', async () => {
      mockDb.query.subscriptions.findMany.mockResolvedValue([MOCK_SUBSCRIPTION]);
      mockDb._queueResolve('where', [{ count: 1 }]);

      const result = await service.getSubscriptions({
        page: 1,
        limit: 10,
        status: 'active',
        userId: TEST_USER.id,
      } as any);

      expect(result.data).toEqual([MOCK_SUBSCRIPTION]);
      expect(result.total).toBe(1);
    });
  });

  // ============================================================================
  // getSubscriptionStats
  // ============================================================================
  describe('getSubscriptionStats', () => {
    it('구독 통계를 계산한다 (MRR/ARR 포함)', async () => {
      const subs = [
        { ...MOCK_SUBSCRIPTION, status: 'active', price: 2900, interval: 'month', productId: 'prod-1' },
        { ...MOCK_SUBSCRIPTION, id: 'sub-002', status: 'active', price: 29900, interval: 'year', productId: 'prod-2' },
        { ...MOCK_SUBSCRIPTION, id: 'sub-003', status: 'cancelled', price: 990, interval: 'month', productId: 'prod-1' },
      ];
      mockDb.query.subscriptions.findMany.mockResolvedValue(subs);
      mockDb.query.products.findMany.mockResolvedValue([
        { id: 'prod-1', name: 'Monthly Pro' },
        { id: 'prod-2', name: 'Yearly Pro' },
      ]);

      const result = await service.getSubscriptionStats();

      expect(result.total).toBe(3);
      expect(result.active).toBe(2);
      expect(result.cancelled).toBe(1);
      // MRR: 2900 + Math.round(29900/12) = 2900 + 2492 = 5392
      expect(result.mrr).toBe(5392);
      // ARR: 2900*12 + 29900 = 34800 + 29900 = 64700
      expect(result.arr).toBe(64700);
      expect(result.byPlan).toHaveLength(2);
    });

    it('빈 구독 목록의 통계를 반환한다', async () => {
      mockDb.query.subscriptions.findMany.mockResolvedValue([]);
      mockDb.query.products.findMany.mockResolvedValue([]);

      const result = await service.getSubscriptionStats();

      expect(result.total).toBe(0);
      expect(result.mrr).toBe(0);
      expect(result.arr).toBe(0);
    });
  });

  // ============================================================================
  // getSubscribers
  // ============================================================================
  describe('getSubscribers', () => {
    it('구독자 목록을 반환한다', async () => {
      const subscriberData = [{ id: TEST_USER.id, name: TEST_USER.name, status: 'active' }];
      mockDb._queueResolve('offset', subscriberData);
      mockDb._queueResolve('where', [{ count: 1 }]);

      const result = await service.getSubscribers({ page: 1, limit: 10 });

      expect(result.data).toEqual(subscriberData);
      expect(result.total).toBe(1);
    });
  });

  // ============================================================================
  // getOrders
  // ============================================================================
  describe('getOrders', () => {
    it('주문 목록을 반환한다', async () => {
      mockDb.query.orders.findMany.mockResolvedValue([MOCK_ORDER]);
      mockDb._queueResolve('where', [{ count: 1 }]);

      const result = await service.getOrders({ page: 1, limit: 10 } as any);

      expect(result.data).toEqual([MOCK_ORDER]);
      expect(result.total).toBe(1);
    });
  });

  // ============================================================================
  // getUserLicenses
  // ============================================================================
  describe('getUserLicenses', () => {
    it('사용자 라이선스 목록을 반환한다', async () => {
      mockDb.query.licenses.findMany.mockResolvedValue([MOCK_LICENSE]);

      const result = await service.getUserLicenses(TEST_USER.id);

      expect(result).toEqual([MOCK_LICENSE]);
    });
  });

  // ============================================================================
  // getLicenses
  // ============================================================================
  describe('getLicenses', () => {
    it('라이선스 목록을 반환한다', async () => {
      mockDb.query.licenses.findMany.mockResolvedValue([MOCK_LICENSE]);
      mockDb._queueResolve('where', [{ count: 1 }]);

      const result = await service.getLicenses({ page: 1, limit: 10 } as any);

      expect(result.data).toEqual([MOCK_LICENSE]);
      expect(result.total).toBe(1);
    });
  });

  // ============================================================================
  // validateLicense
  // ============================================================================
  describe('validateLicense', () => {
    it('유효한 라이선스를 검증한다', async () => {
      mockProvider.validateLicenseKey.mockResolvedValue({
        valid: true,
        activationLimit: 5,
        activationUsage: 1,
      });
      mockDb.query.licenses.findFirst.mockResolvedValue(MOCK_LICENSE);

      const result = await service.validateLicense('LICENSE-KEY-001');

      expect(result.valid).toBe(true);
      expect(result.license).toEqual(MOCK_LICENSE);
      expect(result.meta.activationLimit).toBe(5);
    });

    it('존재하지 않는 라이선스는 NotFoundException을 던진다', async () => {
      mockProvider.validateLicenseKey.mockResolvedValue({ valid: false });
      mockDb.query.licenses.findFirst.mockResolvedValue(null);

      await expect(service.validateLicense('INVALID-KEY')).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================================
  // refundOrder
  // ============================================================================
  describe('refundOrder', () => {
    it('주문을 환불한다', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue(MOCK_ORDER);
      mockProvider.refundOrder.mockResolvedValue({ success: true, refundId: 'ref-001' });

      const result = await service.refundOrder('order-001');

      expect(result.success).toBe(true);
      expect(result.amount).toBe(2900);
      expect(result.refundId).toBe('ref-001');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('부분 환불 금액을 지정할 수 있다', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue(MOCK_ORDER);
      mockProvider.refundOrder.mockResolvedValue({ success: true, refundId: 'ref-002' });

      const result = await service.refundOrder('order-001', 1000, 'partial refund');

      expect(result.amount).toBe(1000);
      expect(result.reason).toBe('partial refund');
    });

    it('존재하지 않는 주문은 NotFoundException을 던진다', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue(null);

      await expect(service.refundOrder('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('이미 환불된 주문은 BadRequestException을 던진다', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue({ ...MOCK_ORDER, refunded: true });

      await expect(service.refundOrder('order-001')).rejects.toThrow(BadRequestException);
    });

    it('프로바이더 환불 실패 시 BadRequestException을 던진다', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue(MOCK_ORDER);
      mockProvider.refundOrder.mockResolvedValue({ success: false });

      await expect(service.refundOrder('order-001')).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================================
  // refundSubscription
  // ============================================================================
  describe('refundSubscription', () => {
    it('구독 환불 요청을 생성한다', async () => {
      mockDb.query.subscriptions.findFirst.mockResolvedValue(MOCK_SUBSCRIPTION);

      const result = await service.refundSubscription('sub-001', 'service issue');

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBe('sub-001');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('존재하지 않는 구독은 NotFoundException을 던진다', async () => {
      mockDb.query.subscriptions.findFirst.mockResolvedValue(null);

      await expect(service.refundSubscription('non-existent', 'reason')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================================================
  // getRefundRequests
  // ============================================================================
  describe('getRefundRequests', () => {
    it('미처리 환불 요청 목록을 반환한다', async () => {
      const mockEvents = [{ id: 'evt-1', eventName: 'refund_requested', processed: false }];
      mockDb.query.webhookEvents.findMany.mockResolvedValue(mockEvents);

      const result = await service.getRefundRequests();

      expect(result).toEqual(mockEvents);
      expect(mockDb.query.webhookEvents.findMany).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // checkRefundable
  // ============================================================================
  describe('checkRefundable', () => {
    it('환불 가능한 주문을 확인한다', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue(MOCK_ORDER);
      mockDb._queueResolve('limit', []); // no existing refund request

      const result = await service.checkRefundable(TEST_USER.id, 'order-001');

      expect(result.refundable).toBe(true);
      expect(result.estimatedAmount).toBe(2900);
    });

    it('존재하지 않는 주문은 NotFoundException을 던진다', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue(null);

      await expect(service.checkRefundable(TEST_USER.id, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('이미 환불된 주문은 환불 불가를 반환한다', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue({ ...MOCK_ORDER, refunded: true });

      const result = await service.checkRefundable(TEST_USER.id, 'order-001');

      expect(result.refundable).toBe(false);
      expect(result.reason).toContain('이미 환불');
    });

    it('7일 초과 주문은 환불 불가를 반환한다', async () => {
      const oldOrder = {
        ...MOCK_ORDER,
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      };
      mockDb.query.orders.findFirst.mockResolvedValue(oldOrder);

      const result = await service.checkRefundable(TEST_USER.id, 'order-001');

      expect(result.refundable).toBe(false);
      expect(result.reason).toContain('7일');
    });

    it('진행 중인 환불 요청이 있으면 환불 불가를 반환한다', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue(MOCK_ORDER);
      mockDb._queueResolve('limit', [MOCK_REFUND_REQUEST]); // existing pending request

      const result = await service.checkRefundable(TEST_USER.id, 'order-001');

      expect(result.refundable).toBe(false);
      expect(result.reason).toContain('진행 중');
    });
  });

  // ============================================================================
  // requestRefund
  // ============================================================================
  describe('requestRefund', () => {
    it('환불 요청을 생성한다', async () => {
      // checkRefundable 내부: orders.findFirst + select().from().where().limit()
      mockDb.query.orders.findFirst.mockResolvedValue(MOCK_ORDER);
      mockDb._queueResolve('limit', []); // no existing request
      // requestRefund: insert().values().returning()
      mockDb._queueResolve('returning', [MOCK_REFUND_REQUEST]);

      const result = await service.requestRefund(TEST_USER.id, {
        orderId: 'order-001',
        reasonType: 'not_satisfied',
        reasonDetail: 'Not what I expected',
      } as any);

      expect(result).toEqual(MOCK_REFUND_REQUEST);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('환불 불가능 시 BadRequestException을 던진다', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue({ ...MOCK_ORDER, refunded: true });

      await expect(
        service.requestRefund(TEST_USER.id, {
          orderId: 'order-001',
          reasonType: 'not_satisfied',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================================
  // getMyRefundRequests
  // ============================================================================
  describe('getMyRefundRequests', () => {
    it('내 환불 요청 목록을 반환한다', async () => {
      mockDb._queueResolve('offset', [MOCK_REFUND_REQUEST]);
      mockDb._queueResolve('where', [{ count: 1 }]);

      const result = await service.getMyRefundRequests(TEST_USER.id, { page: 1, limit: 10 });

      expect(result.data).toEqual([MOCK_REFUND_REQUEST]);
      expect(result.total).toBe(1);
    });
  });

  // ============================================================================
  // adminProcessRefundRequest
  // ============================================================================
  describe('adminProcessRefundRequest', () => {
    it('환불 요청을 승인한다', async () => {
      // 1) select().from().where().limit() → find request
      mockDb._queueResolve('limit', [MOCK_REFUND_REQUEST]);
      // 2) refundOrder 내부: query.orders.findFirst
      mockDb.query.orders.findFirst.mockResolvedValue(MOCK_ORDER);
      mockProvider.refundOrder.mockResolvedValue({ success: true, refundId: 'ref-001' });
      // 3) update().set().where().returning() → update status
      mockDb._queueResolve('returning', [{ ...MOCK_REFUND_REQUEST, status: 'approved' }]);

      const result = await service.adminProcessRefundRequest('admin-001', {
        requestId: 'refund-001',
        action: 'approve',
        adminNote: 'Approved',
      });

      expect(result?.status).toBe('approved');
      expect(mockProvider.refundOrder).toHaveBeenCalled();
    });

    it('환불 요청을 거절한다', async () => {
      mockDb._queueResolve('limit', [MOCK_REFUND_REQUEST]);
      mockDb._queueResolve('returning', [{ ...MOCK_REFUND_REQUEST, status: 'rejected' }]);

      const result = await service.adminProcessRefundRequest('admin-001', {
        requestId: 'refund-001',
        action: 'reject',
        adminNote: 'Rejected',
      });

      expect(result?.status).toBe('rejected');
      expect(mockProvider.refundOrder).not.toHaveBeenCalled();
    });

    it('존재하지 않는 요청은 NotFoundException을 던진다', async () => {
      mockDb._queueResolve('limit', []);

      await expect(
        service.adminProcessRefundRequest('admin-001', {
          requestId: 'non-existent',
          action: 'approve',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('이미 처리된 요청은 BadRequestException을 던진다', async () => {
      mockDb._queueResolve('limit', [{ ...MOCK_REFUND_REQUEST, status: 'approved' }]);

      await expect(
        service.adminProcessRefundRequest('admin-001', {
          requestId: 'refund-001',
          action: 'approve',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
