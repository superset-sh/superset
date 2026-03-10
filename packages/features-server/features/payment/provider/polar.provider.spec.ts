import { createHmac } from 'crypto';

// ============================================================================
// Mocks
// ============================================================================

const mockPolarClient = {
  products: {
    list: jest.fn(),
    get: jest.fn(),
  },
  checkouts: {
    create: jest.fn(),
  },
  subscriptions: {
    get: jest.fn(),
    update: jest.fn(),
    revoke: jest.fn(),
  },
  licenseKeys: {
    validate: jest.fn(),
    activate: jest.fn(),
    deactivate: jest.fn(),
  },
  orders: {
    get: jest.fn(),
  },
  refunds: {
    create: jest.fn(),
  },
};

jest.mock('@polar-sh/sdk', () => ({
  Polar: jest.fn().mockImplementation(() => mockPolarClient),
}));

jest.mock('@/core/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../config/payment.config', () => ({
  paymentConfig: { KEY: 'PAYMENT_CONFIG' },
}));

jest.mock('../types/polar.types', () => ({
  POLAR_EVENT_MAP: {
    'subscription.created': 'subscription_created',
    'subscription.updated': 'subscription_updated',
    'subscription.canceled': 'subscription_cancelled',
    'order.created': 'order_created',
    'order.refunded': 'order_refunded',
  },
  POLAR_STATUS_MAP: {
    active: 'active',
    canceled: 'cancelled',
    trialing: 'on_trial',
  },
}));

import { Test, type TestingModule } from '@nestjs/testing';
import { PolarProvider } from './polar.provider';

// ============================================================================
// Helpers
// ============================================================================

function createAsyncIterable<T>(pages: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < pages.length) return { value: pages[i++]!, done: false };
          return { value: undefined as any, done: true as const };
        },
      };
    },
  };
}

const MOCK_CONFIG = {
  activeProvider: 'polar' as const,
  polarAccessToken: 'test-access-token',
  polarOrganizationId: 'org-001',
  polarWebhookSecret: 'whsec_' + Buffer.from('test-secret-key-32bytes!').toString('base64'),
  lemonSqueezyApiKey: '',
  lemonSqueezyStoreId: '',
  lemonSqueezyWebhookSecret: '',
};

const MOCK_PRODUCT = {
  id: 'prod-001',
  name: 'Pro Plan',
  description: 'Pro features',
  visibility: 'public',
  isRecurring: true,
  recurringInterval: 'month',
  recurringIntervalCount: 1,
  prices: [
    {
      id: 'price-001',
      amountType: 'fixed',
      priceAmount: 2900,
    },
  ],
  benefits: [] as Array<{ type: string }>,
};

const MOCK_SUBSCRIPTION = {
  id: 'sub-001',
  productId: 'prod-001',
  status: 'active',
  amount: 2900,
  currency: 'USD',
  recurringInterval: 'month',
  currentPeriodEnd: new Date('2026-03-01'),
  endsAt: null,
  trialEnd: null,
  customer: {
    email: 'qa@test.com',
    name: 'QA Tester',
  },
};

// ============================================================================
// Tests
// ============================================================================

describe('PolarProvider', () => {
  let provider: PolarProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolarProvider,
        { provide: 'PAYMENT_CONFIG', useValue: MOCK_CONFIG },
      ],
    }).compile();

    provider = module.get<PolarProvider>(PolarProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // providerName
  // ==========================================================================
  describe('providerName', () => {
    it('polar를 반환한다', () => {
      expect(provider.providerName).toBe('polar');
    });
  });

  // ==========================================================================
  // getProducts
  // ==========================================================================
  describe('getProducts', () => {
    it('상품 목록을 정규화하여 반환한다', async () => {
      mockPolarClient.products.list.mockReturnValue(
        createAsyncIterable([{ result: { items: [MOCK_PRODUCT] } }]),
      );

      const result = await provider.getProducts();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        externalId: 'prod-001',
        name: 'Pro Plan',
        description: 'Pro features',
        status: 'published',
        price: 29,
        currency: 'USD',
      });
    });

    it('비공개 상품은 status=draft로 반환한다', async () => {
      const privateProduct = { ...MOCK_PRODUCT, visibility: 'private' };
      mockPolarClient.products.list.mockReturnValue(
        createAsyncIterable([{ result: { items: [privateProduct] } }]),
      );

      const result = await provider.getProducts();

      expect(result[0]!.status).toBe('draft');
    });
  });

  // ==========================================================================
  // getProduct
  // ==========================================================================
  describe('getProduct', () => {
    it('단일 상품을 정규화하여 반환한다', async () => {
      mockPolarClient.products.get.mockResolvedValue(MOCK_PRODUCT);

      const result = await provider.getProduct('prod-001');

      expect(result.externalId).toBe('prod-001');
      expect(result.name).toBe('Pro Plan');
      expect(result.price).toBe(29);
    });
  });

  // ==========================================================================
  // getVariants
  // ==========================================================================
  describe('getVariants', () => {
    it('productId가 있으면 해당 상품의 가격을 Variant로 반환한다', async () => {
      mockPolarClient.products.get.mockResolvedValue(MOCK_PRODUCT);

      const result = await provider.getVariants('prod-001');

      expect(result).toHaveLength(1);
      expect(result[0]!.price).toBe(29);
      expect(result[0]!.isSubscription).toBe(true);
    });

    it('productId 없으면 전체 상품의 Variant를 반환한다', async () => {
      mockPolarClient.products.list.mockReturnValue(
        createAsyncIterable([{ result: { items: [MOCK_PRODUCT] } }]),
      );

      const result = await provider.getVariants();

      expect(result).toHaveLength(1);
      expect(mockPolarClient.products.list).toHaveBeenCalled();
    });

    it('가격이 없는 상품은 상품 자체를 하나의 Variant로 반환한다', async () => {
      const noPriceProduct = { ...MOCK_PRODUCT, prices: [] };
      mockPolarClient.products.get.mockResolvedValue(noPriceProduct);

      const result = await provider.getVariants('prod-001');

      expect(result).toHaveLength(1);
      expect(result[0]!.price).toBe(0);
    });
  });

  // ==========================================================================
  // getVariantPriceModel
  // ==========================================================================
  describe('getVariantPriceModel', () => {
    it('가격 모델을 반환한다', async () => {
      mockPolarClient.products.get.mockResolvedValue(MOCK_PRODUCT);

      const result = await provider.getVariantPriceModel('prod-001');

      expect(result).toEqual({
        id: 'prod-001',
        scheme: 'standard',
        unitPrice: 29,
        renewalIntervalUnit: 'month',
        tiers: null,
      });
    });

    it('상품이 없으면 null을 반환한다', async () => {
      mockPolarClient.products.get.mockRejectedValue(new Error('Not found'));

      const result = await provider.getVariantPriceModel('non-existent');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // createCheckout
  // ==========================================================================
  describe('createCheckout', () => {
    it('체크아웃 URL을 반환한다', async () => {
      mockPolarClient.checkouts.create.mockResolvedValue({
        id: 'checkout-001',
        url: 'https://checkout.polar.sh/test',
      });

      const result = await provider.createCheckout({
        variantOrProductId: 'prod-001',
        email: 'qa@test.com',
        name: 'QA Tester',
        redirectUrl: 'https://app.test/success',
      });

      expect(result.checkoutUrl).toBe('https://checkout.polar.sh/test');
      expect(mockPolarClient.checkouts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          products: ['prod-001'],
          customerEmail: 'qa@test.com',
        }),
      );
    });
  });

  // ==========================================================================
  // getSubscription / cancelSubscription
  // ==========================================================================
  describe('getSubscription', () => {
    it('구독 정보를 정규화하여 반환한다', async () => {
      mockPolarClient.subscriptions.get.mockResolvedValue(MOCK_SUBSCRIPTION);

      const result = await provider.getSubscription('sub-001');

      expect(result.externalId).toBe('sub-001');
      expect(result.status).toBe('active');
      expect(result.price).toBe(29);
      expect(result.customerEmail).toBe('qa@test.com');
    });
  });

  describe('updateSubscription', () => {
    it('구독을 업데이트하고 정규화된 결과를 반환한다', async () => {
      mockPolarClient.subscriptions.update.mockResolvedValue(MOCK_SUBSCRIPTION);

      const result = await provider.updateSubscription('sub-001', { productId: 'prod-002' });

      expect(result.externalId).toBe('sub-001');
      expect(mockPolarClient.subscriptions.update).toHaveBeenCalledWith({
        id: 'sub-001',
        subscriptionUpdate: { productId: 'prod-002' },
      });
    });
  });

  describe('cancelSubscription', () => {
    it('구독을 취소하고 정규화된 결과를 반환한다', async () => {
      const cancelledSub = { ...MOCK_SUBSCRIPTION, status: 'canceled' };
      mockPolarClient.subscriptions.revoke.mockResolvedValue(cancelledSub);

      const result = await provider.cancelSubscription('sub-001');

      expect(result.status).toBe('cancelled');
      expect(mockPolarClient.subscriptions.revoke).toHaveBeenCalledWith({ id: 'sub-001' });
    });
  });

  // ==========================================================================
  // License Keys
  // ==========================================================================
  describe('validateLicenseKey', () => {
    it('유효한 라이센스 키를 검증한다', async () => {
      mockPolarClient.licenseKeys.validate.mockResolvedValue({
        status: 'granted',
        limitActivations: 5,
        usage: 1,
      });

      const result = await provider.validateLicenseKey('LICENSE-KEY-001');

      expect(result.valid).toBe(true);
      expect(result.activationLimit).toBe(5);
      expect(result.activationUsage).toBe(1);
    });

    it('유효하지 않은 라이센스 키는 valid=false를 반환한다', async () => {
      mockPolarClient.licenseKeys.validate.mockResolvedValue({
        status: 'revoked',
        limitActivations: 5,
        usage: 0,
      });

      const result = await provider.validateLicenseKey('INVALID-KEY');

      expect(result.valid).toBe(false);
    });
  });

  describe('activateLicenseKey', () => {
    it('라이센스 키를 활성화한다', async () => {
      mockPolarClient.licenseKeys.activate.mockResolvedValue({
        licenseKeyId: 'lk-001',
        licenseKey: {
          id: 'lk-001',
          key: 'LICENSE-KEY-001',
          status: 'granted',
          limitActivations: 5,
          usage: 1,
          expiresAt: null,
        },
      });

      const result = await provider.activateLicenseKey('LICENSE-KEY-001', 'my-device');

      expect(result.externalId).toBe('lk-001');
      expect(result.key).toBe('LICENSE-KEY-001');
    });
  });

  describe('deactivateLicenseKey', () => {
    it('라이센스 키를 비활성화한다', async () => {
      mockPolarClient.licenseKeys.deactivate.mockResolvedValue(undefined);

      await expect(
        provider.deactivateLicenseKey('LICENSE-KEY-001', 'activation-001'),
      ).resolves.toBeUndefined();

      expect(mockPolarClient.licenseKeys.deactivate).toHaveBeenCalledWith({
        key: 'LICENSE-KEY-001',
        organizationId: 'org-001',
        activationId: 'activation-001',
      });
    });
  });

  // ==========================================================================
  // Refunds
  // ==========================================================================
  describe('refundOrder', () => {
    it('금액 지정 시 부분 환불을 처리한다', async () => {
      mockPolarClient.refunds.create.mockResolvedValue({ id: 'refund-001' });

      const result = await provider.refundOrder('order-001', 1500);

      expect(result.success).toBe(true);
      expect(result.refundId).toBe('refund-001');
      expect(mockPolarClient.refunds.create).toHaveBeenCalledWith({
        orderId: 'order-001',
        reason: 'customer_request',
        amount: 1500,
      });
    });

    it('금액 미지정 시 전액 환불을 처리한다', async () => {
      mockPolarClient.orders.get.mockResolvedValue({ totalAmount: 2900 });
      mockPolarClient.refunds.create.mockResolvedValue({ id: 'refund-002' });

      const result = await provider.refundOrder('order-001');

      expect(result.success).toBe(true);
      expect(mockPolarClient.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 2900 }),
      );
    });
  });

  // ==========================================================================
  // Webhook
  // ==========================================================================
  describe('parseWebhook', () => {
    it('Polar 이벤트를 정규화된 이벤트로 파싱한다', () => {
      const payload = {
        type: 'subscription.created',
        data: { id: 'sub-001', plan: 'pro' },
      };

      const result = provider.parseWebhook(payload);

      expect(result.eventType).toBe('subscription_created');
      expect(result.externalId).toBe('sub-001');
    });

    it('알 수 없는 이벤트는 subscription_updated로 폴백한다', () => {
      const payload = {
        type: 'unknown.event',
        data: { id: 'evt-001' },
      };

      const result = provider.parseWebhook(payload);

      expect(result.eventType).toBe('subscription_updated');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('유효한 서명을 검증한다', () => {
      const secret = MOCK_CONFIG.polarWebhookSecret;
      const secretBytes = Buffer.from(secret.slice(6), 'base64');

      const webhookId = 'msg_001';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const rawBody = '{"type":"subscription.created","data":{}}';

      const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
      const expectedSig = createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64');

      const signature = `${webhookId}.${webhookTimestamp}.v1,${expectedSig}`;

      expect(provider.verifyWebhookSignature(rawBody, signature)).toBe(true);
    });

    it('잘못된 서명은 false를 반환한다', () => {
      const signature = 'msg_001.1234567890.v1,invalid-signature';
      const rawBody = '{"type":"test"}';

      expect(provider.verifyWebhookSignature(rawBody, signature)).toBe(false);
    });

    it('만료된 타임스탬프는 false를 반환한다', () => {
      const secret = MOCK_CONFIG.polarWebhookSecret;
      const secretBytes = Buffer.from(secret.slice(6), 'base64');

      const webhookId = 'msg_002';
      // 10분 전 타임스탬프 (5분 허용 초과)
      const webhookTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
      const rawBody = '{"type":"test"}';

      const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
      const expectedSig = createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64');

      const signature = `${webhookId}.${webhookTimestamp}.v1,${expectedSig}`;

      expect(provider.verifyWebhookSignature(rawBody, signature)).toBe(false);
    });

    it('파트가 부족한 서명은 false를 반환한다', () => {
      expect(provider.verifyWebhookSignature('body', 'invalid')).toBe(false);
    });
  });

  // ==========================================================================
  // Store/Org
  // ==========================================================================
  describe('getStoreId', () => {
    it('organization ID를 반환한다', () => {
      expect(provider.getStoreId()).toBe('org-001');
    });
  });

  describe('getStoreCurrency', () => {
    it('USD를 반환한다', async () => {
      const result = await provider.getStoreCurrency();

      expect(result).toBe('USD');
    });
  });
});
