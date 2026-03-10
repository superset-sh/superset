import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from '@superbuilder/drizzle';
import { createLogger } from '../../core/logger';
import { paymentConfig } from './config/payment.config';

// Services
import { LemonSqueezyService } from './service/lemon-squeezy.service';
import { InicisService } from './service/inicis.service';
import { PaymentService } from './service/payment.service';
import { WebhookService } from './service/webhook.service';
import { PlanService } from './service/plan.service';
import { CreditService } from './service/credit.service';
import { ModelPricingService } from './service/model-pricing.service';

// Providers
import { PaymentProviderFactory } from './provider/payment-provider.factory';
import { LemonSqueezyProvider } from './provider/lemon-squeezy.provider';
import { PolarProvider } from './provider/polar.provider';
import { InicisProvider } from './provider/inicis.provider';

// Controllers
import {
  PaymentController,
  WebhookController,
  WebhookPolarController,
  WebhookInicisController,
  InicisCallbackController,
  SubscriptionController,
  PaymentAdminController,
  CreditApiController,
} from './controller';

// Router
import { injectPaymentServices } from './payment.router';

const logger = createLogger('payment');

@Module({
  imports: [ConfigModule.forFeature(paymentConfig), DrizzleModule],
  controllers: [
    PaymentController,
    WebhookController,
    WebhookPolarController,
    WebhookInicisController,
    InicisCallbackController,
    SubscriptionController,
    PaymentAdminController,
    CreditApiController,
  ],
  providers: [
    LemonSqueezyService,
    InicisService,
    PaymentService,
    WebhookService,
    PlanService,
    CreditService,
    ModelPricingService,
    PaymentProviderFactory,
    LemonSqueezyProvider,
    PolarProvider,
    InicisProvider,
  ],
  exports: [
    PaymentProviderFactory,
    LemonSqueezyService,
    InicisService,
    PaymentService,
    WebhookService,
    PlanService,
    CreditService,
    ModelPricingService,
  ],
})
export class PaymentModule implements OnModuleInit {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly webhookService: WebhookService,
    private readonly planService: PlanService,
    private readonly creditService: CreditService,
    private readonly modelPricingService: ModelPricingService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly lsProvider: LemonSqueezyProvider,
    private readonly polarProvider: PolarProvider,
    private readonly inicisProvider: InicisProvider,
  ) {}

  async onModuleInit() {
    // Register payment providers in factory
    this.providerFactory.register(this.lsProvider);
    this.providerFactory.register(this.polarProvider);
    this.providerFactory.register(this.inicisProvider);

    // Inject services into tRPC router
    injectPaymentServices({
      paymentService: this.paymentService,
      providerFactory: this.providerFactory,
      planService: this.planService,
      creditService: this.creditService,
      modelPricingService: this.modelPricingService,
    });

    // WebhookService에 PlanService 주입 (구독 생성 시 크레딧 할당용)
    this.webhookService.setPlanService(this.planService);

    // 로컬 전용 플랜 자동 seed (없으면 생성, 있으면 스킵)
    try {
      const free = await this.planService.seedFreePlan();
      if (free.created && free.plan) {
        logger.info('Free plan seeded', {
          'payment.plan_name': free.plan.name,
        });
      }
      const enterprise = await this.planService.seedEnterprisePlan();
      if (enterprise.created && enterprise.plan) {
        logger.info('Enterprise plan seeded', {
          'payment.plan_name': enterprise.plan.name,
        });
      }
    } catch (error) {
      logger.error('Plan seed failed', {
        'error.message': error instanceof Error ? error.message : String(error),
      });
    }
  }
}
