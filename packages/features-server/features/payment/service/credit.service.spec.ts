jest.mock('drizzle-orm', () => ({
  eq: jest.fn((field: any, value: any) => ({ field, value, type: 'eq' })),
  desc: jest.fn((field: any) => ({ field, type: 'desc' })),
  count: jest.fn(() => ({ type: 'count' })),
}));

jest.mock('@superbuilder/drizzle', () => {
  const { Inject } = require('@nestjs/common');
  return {
    DRIZZLE: 'DRIZZLE_TOKEN',
    InjectDrizzle: () => Inject('DRIZZLE_TOKEN'),
    paymentCreditBalances: {
      userId: { name: 'user_id' },
      balance: { name: 'balance' },
      monthlyAllocation: { name: 'monthly_allocation' },
    },
    paymentCreditTransactions: {
      userId: { name: 'user_id' },
      createdAt: { name: 'created_at' },
    },
    paymentModelPricing: {
      modelId: { name: 'model_id' },
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
  buildPaginatedResult: jest.fn(
    (data: any[], total: number, page: number, limit: number) => ({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }),
  ),
}));

import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CreditService } from './credit.service';
import { DRIZZLE } from '@superbuilder/drizzle';
import { createMockDb, TEST_USER, TEST_CREDIT_BALANCE } from '../__test-utils__';

describe('CreditService', () => {
  let service: CreditService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<CreditService>(CreditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockDb._resetQueue();
  });

  // ============================================================================
  // getBalance
  // ============================================================================
  describe('getBalance', () => {
    it('기존 잔액 레코드를 반환한다', async () => {
      mockDb.query.paymentCreditBalances.findFirst.mockResolvedValue(TEST_CREDIT_BALANCE);

      const result = await service.getBalance(TEST_USER.id);

      expect(result).toEqual(TEST_CREDIT_BALANCE);
      expect(mockDb.query.paymentCreditBalances.findFirst).toHaveBeenCalled();
    });

    it('잔액 레코드가 없으면 기본값(0)으로 생성한다', async () => {
      mockDb.query.paymentCreditBalances.findFirst.mockResolvedValue(null);

      const newBalance = { ...TEST_CREDIT_BALANCE, balance: 0, monthlyAllocation: 0 };
      mockDb._queueResolve('returning', [newBalance]);

      const result = await service.getBalance(TEST_USER.id);

      expect(result).toEqual(newBalance);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('생성 시 onConflictDoUpdate로 중복 방지한다', async () => {
      mockDb.query.paymentCreditBalances.findFirst.mockResolvedValue(null);
      mockDb._queueResolve('returning', [{ ...TEST_CREDIT_BALANCE, balance: 0 }]);

      await service.getBalance(TEST_USER.id);

      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // checkBalance
  // ============================================================================
  describe('checkBalance', () => {
    it('잔액이 충분하면 sufficient: true를 반환한다', async () => {
      mockDb.query.paymentCreditBalances.findFirst.mockResolvedValue(TEST_CREDIT_BALANCE);

      const result = await service.checkBalance(TEST_USER.id, 100);

      expect(result.sufficient).toBe(true);
      expect(result.currentBalance).toBe(TEST_CREDIT_BALANCE.balance);
      expect(result.estimatedCost).toBe(100);
      expect(result.remaining).toBe(TEST_CREDIT_BALANCE.balance - 100);
    });

    it('잔액이 부족하면 sufficient: false를 반환한다', async () => {
      mockDb.query.paymentCreditBalances.findFirst.mockResolvedValue(TEST_CREDIT_BALANCE);

      const result = await service.checkBalance(TEST_USER.id, 99999);

      expect(result.sufficient).toBe(false);
      expect(result.remaining).toBeLessThan(0);
    });

    it('정확히 잔액과 같으면 sufficient: true를 반환한다', async () => {
      mockDb.query.paymentCreditBalances.findFirst.mockResolvedValue(TEST_CREDIT_BALANCE);

      const result = await service.checkBalance(TEST_USER.id, TEST_CREDIT_BALANCE.balance);

      expect(result.sufficient).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });

  // ============================================================================
  // deductCredits
  // ============================================================================
  describe('deductCredits', () => {
    const txDb = () => mockDb._tx;

    it('정상적으로 크레딧을 차감한다', async () => {
      const tx = txDb();
      tx.query.paymentCreditBalances.findFirst.mockResolvedValue(TEST_CREDIT_BALANCE);
      tx._queueResolve('returning', [{ id: 'tx-001', type: 'deduction', amount: -100 }]);

      const result = await service.deductCredits(TEST_USER.id, 100);

      expect(result.balanceBefore).toBe(TEST_CREDIT_BALANCE.balance);
      expect(result.balanceAfter).toBe(TEST_CREDIT_BALANCE.balance - 100);
      expect(result.transaction).toBeDefined();
      expect(tx.update).toHaveBeenCalled();
    });

    it('잔액 레코드가 없으면 에러를 던진다', async () => {
      const tx = txDb();
      tx.query.paymentCreditBalances.findFirst.mockResolvedValue(null);

      await expect(service.deductCredits(TEST_USER.id, 100)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('잔액이 부족하면 에러를 던진다', async () => {
      const tx = txDb();
      tx.query.paymentCreditBalances.findFirst.mockResolvedValue(TEST_CREDIT_BALANCE);

      await expect(service.deductCredits(TEST_USER.id, 99999)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('메타데이터를 포함하여 차감한다', async () => {
      const tx = txDb();
      tx.query.paymentCreditBalances.findFirst.mockResolvedValue(TEST_CREDIT_BALANCE);
      tx._queueResolve('returning', [{ id: 'tx-002', type: 'deduction', amount: -50 }]);

      const metadata = {
        modelId: 'gpt-4',
        provider: 'openai',
        promptTokens: 100,
        completionTokens: 200,
      };

      const result = await service.deductCredits(TEST_USER.id, 50, metadata);

      expect(result.balanceAfter).toBe(TEST_CREDIT_BALANCE.balance - 50);
      expect(tx.insert).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // addCredits
  // ============================================================================
  describe('addCredits', () => {
    const txDb = () => mockDb._tx;

    it('allocation 타입으로 크레딧을 추가한다', async () => {
      const tx = txDb();
      tx.query.paymentCreditBalances.findFirst.mockResolvedValue(TEST_CREDIT_BALANCE);
      tx._queueResolve('returning', [{ id: 'tx-003', type: 'allocation', amount: 1000 }]);

      const result = await service.addCredits(TEST_USER.id, 1000, 'allocation', '월간 배정');

      expect(result.balanceBefore).toBe(TEST_CREDIT_BALANCE.balance);
      expect(result.balanceAfter).toBe(TEST_CREDIT_BALANCE.balance + 1000);
    });

    it('잔액 레코드가 없으면 생성 후 추가한다', async () => {
      const tx = txDb();
      tx.query.paymentCreditBalances.findFirst.mockResolvedValue(null);
      // insert().returning() for balance creation
      tx._queueResolve('returning', [{ ...TEST_CREDIT_BALANCE, balance: 0, monthlyAllocation: 0 }]);
      // insert().returning() for transaction log
      tx._queueResolve('returning', [{ id: 'tx-004', type: 'purchase', amount: 500 }]);

      const result = await service.addCredits(TEST_USER.id, 500, 'purchase', '크레딧 구매');

      expect(result.balanceBefore).toBe(0);
      expect(result.balanceAfter).toBe(500);
    });

    it('refund 타입으로 크레딧을 추가한다', async () => {
      const tx = txDb();
      tx.query.paymentCreditBalances.findFirst.mockResolvedValue(TEST_CREDIT_BALANCE);
      tx._queueResolve('returning', [{ id: 'tx-005', type: 'refund', amount: 200 }]);

      const result = await service.addCredits(
        TEST_USER.id, 200, 'refund', '환불', 'order-001',
      );

      expect(result.balanceAfter).toBe(TEST_CREDIT_BALANCE.balance + 200);
    });

    it('adjustment 타입으로 크레딧을 추가한다', async () => {
      const tx = txDb();
      tx.query.paymentCreditBalances.findFirst.mockResolvedValue(TEST_CREDIT_BALANCE);
      tx._queueResolve('returning', [{ id: 'tx-006', type: 'adjustment', amount: 100 }]);

      const result = await service.addCredits(TEST_USER.id, 100, 'adjustment', '관리자 조정');

      expect(result.balanceAfter).toBe(TEST_CREDIT_BALANCE.balance + 100);
    });
  });

  // ============================================================================
  // getTransactions
  // ============================================================================
  describe('getTransactions', () => {
    it('트랜잭션 내역을 페이지네이션으로 반환한다', async () => {
      const transactions = [
        { id: 'tx-001', type: 'deduction', amount: -100 },
        { id: 'tx-002', type: 'allocation', amount: 1000 },
      ];
      mockDb.query.paymentCreditTransactions.findMany.mockResolvedValue(transactions);
      mockDb._queueResolve('where', [{ count: 2 }]);

      const result = await service.getTransactions(TEST_USER.id, { page: 1, limit: 10 });

      expect(result.data).toEqual(transactions);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
    });

    it('트랜잭션이 없으면 빈 배열을 반환한다', async () => {
      mockDb.query.paymentCreditTransactions.findMany.mockResolvedValue([]);
      mockDb._queueResolve('where', [{ count: 0 }]);

      const result = await service.getTransactions(TEST_USER.id, { page: 1, limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ============================================================================
  // adjustBalance
  // ============================================================================
  describe('adjustBalance', () => {
    it('관리자 수동 조정으로 addCredits를 호출한다', async () => {
      const tx = mockDb._tx;
      tx.query.paymentCreditBalances.findFirst.mockResolvedValue(TEST_CREDIT_BALANCE);
      tx._queueResolve('returning', [{ id: 'tx-007', type: 'adjustment', amount: 50 }]);

      const result = await service.adjustBalance(TEST_USER.id, 50, '보상 지급');

      expect(result.balanceAfter).toBe(TEST_CREDIT_BALANCE.balance + 50);
    });
  });

  // ============================================================================
  // calculateCredits
  // ============================================================================
  describe('calculateCredits', () => {
    it('가격표가 있으면 해당 비율로 계산한다', async () => {
      mockDb.query.paymentModelPricing.findFirst.mockResolvedValue({
        modelId: 'gpt-4',
        inputCreditsPerKToken: 10,
        outputCreditsPerKToken: 30,
      });

      const result = await service.calculateCredits('gpt-4', 1000, 500);

      // input: ceil((1000/1000) * 10) = 10
      // output: ceil((500/1000) * 30) = 15
      expect(result).toBe(25);
    });

    it('가격표가 없으면 기본값(1K=1크레딧)으로 계산한다', async () => {
      mockDb.query.paymentModelPricing.findFirst.mockResolvedValue(null);

      const result = await service.calculateCredits('unknown-model', 2000, 1000);

      // input: ceil((2000/1000) * 1) = 2
      // output: ceil((1000/1000) * 1) = 1
      expect(result).toBe(3);
    });

    it('토큰이 0이면 0 크레딧을 반환한다', async () => {
      mockDb.query.paymentModelPricing.findFirst.mockResolvedValue(null);

      const result = await service.calculateCredits('gpt-4', 0, 0);

      expect(result).toBe(0);
    });

    it('소수점 토큰은 올림 처리한다', async () => {
      mockDb.query.paymentModelPricing.findFirst.mockResolvedValue({
        modelId: 'gpt-4',
        inputCreditsPerKToken: 10,
        outputCreditsPerKToken: 30,
      });

      const result = await service.calculateCredits('gpt-4', 100, 100);

      // input: ceil((100/1000) * 10) = ceil(1) = 1
      // output: ceil((100/1000) * 30) = ceil(3) = 3
      expect(result).toBe(4);
    });
  });
});
