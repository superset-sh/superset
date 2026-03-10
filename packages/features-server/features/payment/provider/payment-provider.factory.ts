import { Injectable, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { paymentConfig } from '../config/payment.config';
import type { PaymentProvider } from './payment-provider.interface';
import type { PaymentProviderName } from '../types/normalized.types';

@Injectable()
export class PaymentProviderFactory {
  private providers = new Map<PaymentProviderName, PaymentProvider>();

  constructor(
    @Inject(paymentConfig.KEY)
    private config: ConfigType<typeof paymentConfig>,
  ) {}

  register(provider: PaymentProvider) {
    this.providers.set(provider.providerName, provider);
  }

  getActive(): PaymentProvider {
    const name = this.config.activeProvider;
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Payment provider "${name}" is not registered`);
    }
    return provider;
  }

  getByName(name: PaymentProviderName): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Payment provider "${name}" is not registered`);
    }
    return provider;
  }

  getActiveProviderName(): PaymentProviderName {
    return this.config.activeProvider;
  }
}
