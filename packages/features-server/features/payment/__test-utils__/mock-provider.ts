import type { PaymentProvider } from '../provider/payment-provider.interface';

export function createMockProvider(name = 'polar'): jest.Mocked<PaymentProvider> {
  return {
    providerName: name as any,
    getProducts: jest.fn().mockResolvedValue([]),
    getProduct: jest.fn().mockResolvedValue(null),
    getVariants: jest.fn().mockResolvedValue([]),
    getVariantPriceModel: jest.fn().mockResolvedValue(null),
    createCheckout: jest.fn().mockResolvedValue({ checkoutUrl: 'https://checkout.test' }),
    getSubscription: jest.fn().mockResolvedValue(null),
    updateSubscription: jest.fn().mockResolvedValue(null),
    cancelSubscription: jest.fn().mockResolvedValue(null),
    validateLicenseKey: jest.fn().mockResolvedValue({ valid: true, status: 'granted', activationLimit: 5, activationUsage: 0 }),
    activateLicenseKey: jest.fn().mockResolvedValue(null),
    deactivateLicenseKey: jest.fn().mockResolvedValue(undefined),
    refundOrder: jest.fn().mockResolvedValue({ success: true, refundId: 'refund-001' }),
    parseWebhook: jest.fn().mockReturnValue({ eventType: 'order_created', externalId: 'ext-1', data: {}, customData: undefined, testMode: false }),
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
    getStoreId: jest.fn().mockReturnValue('store-001'),
    getStoreCurrency: jest.fn().mockResolvedValue('USD'),
  } as any;
}
