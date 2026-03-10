import {
  Controller,
  Post,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WebhookService } from '../../service/webhook.service';
import { PaymentProviderFactory } from '../../provider/payment-provider.factory';

/**
 * INICIS 가상계좌 입금통보 웹훅 컨트롤러
 *
 * 가상계좌 결제 시 입금이 완료되면 INICIS가 이 엔드포인트로 통보한다.
 * 실 운영 시에는 INICIS IP 화이트리스트를 미들웨어/가드로 적용해야 한다.
 */
@ApiTags('Payment Webhook')
@Controller('webhook')
export class WebhookInicisController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  @Post('inicis')
  @ApiOperation({ summary: 'INICIS 가상계좌 입금통보 수신' })
  @ApiResponse({ status: 200, description: '웹훅 처리 성공' })
  async handleInicisWebhook(@Body() payload: unknown) {
    const provider = this.providerFactory.getByName('inicis');

    const event = provider.parseWebhook(payload);
    await this.webhookService.handleWebhook(event, 'inicis');

    return { success: true };
  }
}
