export const TEST_USER = {
  id: '2b6527ac-c020-47b3-bcf3-33cb8e43bd7c',
  email: 'qa@test.com',
  name: 'QA Tester',
};

export const TEST_PLAN = {
  id: 'plan-uuid-001',
  name: 'Pro Plan',
  slug: 'pro',
  tier: 'pro' as const,
  description: 'Pro 플랜',
  monthlyCredits: 10000,
  price: 29,
  currency: 'USD',
  interval: 'month',
  isPerSeat: false,
  providerProductId: 'ext-prod-001',
  providerVariantId: 'ext-var-001',
  provider: 'polar',
  features: ['기능 A', '기능 B'],
  isActive: true,
  sortOrder: 1,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const TEST_FREE_PLAN = {
  ...TEST_PLAN,
  id: 'plan-uuid-free',
  name: 'Free',
  slug: 'free',
  tier: 'free' as const,
  description: '무료 플랜',
  monthlyCredits: 100,
  price: 0,
  providerProductId: null,
  providerVariantId: null,
  provider: null,
  features: ['기본 기능'],
  sortOrder: 0,
};

export const TEST_ORDER = {
  id: 'order-uuid-001',
  userId: TEST_USER.id,
  planId: TEST_PLAN.id,
  externalId: 'ext-order-001',
  provider: 'polar',
  status: 'paid' as const,
  amount: 2900,
  currency: 'USD',
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-01-15'),
};

export const TEST_SUBSCRIPTION = {
  id: 'sub-uuid-001',
  userId: TEST_USER.id,
  planId: TEST_PLAN.id,
  externalId: 'ext-sub-001',
  provider: 'polar',
  status: 'active' as const,
  currentPeriodStart: new Date('2026-01-01'),
  currentPeriodEnd: new Date('2026-02-01'),
  cancelledAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const TEST_CREDIT_BALANCE = {
  id: 'balance-uuid-001',
  userId: TEST_USER.id,
  planId: TEST_PLAN.id,
  balance: 500,
  monthlyAllocation: 10000,
  currentPeriodStart: new Date('2026-01-01'),
  currentPeriodEnd: new Date('2026-02-01'),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const TEST_MODEL_PRICING = {
  id: 'pricing-uuid-001',
  modelId: 'gpt-4',
  provider: 'openai',
  displayName: 'GPT-4',
  inputCreditsPerKToken: 10,
  outputCreditsPerKToken: 30,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const TEST_REFUND_REQUEST = {
  id: 'refund-uuid-001',
  orderId: TEST_ORDER.id,
  userId: TEST_USER.id,
  reasonType: 'changed_mind' as const,
  detail: '더 이상 필요하지 않습니다',
  status: 'pending' as const,
  processedBy: null,
  processedAt: null,
  createdAt: new Date('2026-01-20'),
  updatedAt: new Date('2026-01-20'),
};
