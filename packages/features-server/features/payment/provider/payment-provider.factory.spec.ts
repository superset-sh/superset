import { PaymentProviderFactory } from './payment-provider.factory';
import { createMockProvider } from '../__test-utils__';
import type { PaymentProvider } from './payment-provider.interface';

describe('PaymentProviderFactory', () => {
  let factory: PaymentProviderFactory;
  let mockConfig: { activeProvider: string };

  beforeEach(() => {
    mockConfig = { activeProvider: 'polar' };
    factory = new PaymentProviderFactory(mockConfig as any);
  });

  // ============================================================================
  // register
  // ============================================================================
  describe('register', () => {
    it('프로바이더를 등록한다', () => {
      const provider = createMockProvider('polar');

      factory.register(provider);

      expect(factory.getByName('polar')).toBe(provider);
    });

    it('여러 프로바이더를 등록할 수 있다', () => {
      const polar = createMockProvider('polar');
      const lemon = createMockProvider('lemon-squeezy');

      factory.register(polar);
      factory.register(lemon);

      expect(factory.getByName('polar')).toBe(polar);
      expect(factory.getByName('lemon-squeezy')).toBe(lemon);
    });
  });

  // ============================================================================
  // getByName
  // ============================================================================
  describe('getByName', () => {
    it('등록된 프로바이더를 이름으로 조회한다', () => {
      const provider = createMockProvider('polar');
      factory.register(provider);

      const result = factory.getByName('polar');

      expect(result).toBe(provider);
    });

    it('미등록 프로바이더 조회 시 에러를 던진다', () => {
      expect(() => factory.getByName('polar')).toThrow(
        'Payment provider "polar" is not registered',
      );
    });
  });

  // ============================================================================
  // getActive
  // ============================================================================
  describe('getActive', () => {
    it('설정된 활성 프로바이더를 반환한다', () => {
      const provider = createMockProvider('polar');
      factory.register(provider);

      const result = factory.getActive();

      expect(result).toBe(provider);
    });

    it('활성 프로바이더가 미등록이면 에러를 던진다', () => {
      expect(() => factory.getActive()).toThrow(
        'Payment provider "polar" is not registered',
      );
    });
  });

  // ============================================================================
  // getActiveProviderName
  // ============================================================================
  describe('getActiveProviderName', () => {
    it('설정된 활성 프로바이더 이름을 반환한다', () => {
      const result = factory.getActiveProviderName();

      expect(result).toBe('polar');
    });

    it('다른 프로바이더 설정 시 해당 이름을 반환한다', () => {
      mockConfig.activeProvider = 'lemon-squeezy';
      const newFactory = new PaymentProviderFactory(mockConfig as any);

      const result = newFactory.getActiveProviderName();

      expect(result).toBe('lemon-squeezy');
    });
  });
});
