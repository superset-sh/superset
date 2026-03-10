import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WebhookService } from '../../service/webhook.service';
import { PaymentProviderFactory } from '../../provider/payment-provider.factory';
import type { FastifyRequest } from 'fastify';

@ApiTags('Payment Webhook')
@Controller('webhook')
export class WebhookPolarController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  @Post('polar')
  @ApiOperation({ summary: 'Polar 웹훅 수신' })
  @ApiResponse({ status: 200, description: '웹훅 처리 성공' })
  @ApiResponse({ status: 400, description: '잘못된 웹훅 서명' })
  async handlePolarWebhook(
    @Req() req: FastifyRequest,
    @Body() payload: unknown,
    @Headers('webhook-id') webhookId: string,
    @Headers('webhook-timestamp') webhookTimestamp: string,
    @Headers('webhook-signature') webhookSignature: string,
  ) {
    const provider = this.providerFactory.getByName('polar');

    // raw body로 서명 검증
    const rawBody = (req as any).rawBody as string | undefined;

    // Polar는 Standard Webhooks: webhook-id, webhook-timestamp, webhook-signature 헤더 사용
    // 서명 검증을 위해 헤더 값을 결합하여 전달
    const signatureHeader = `${webhookId}.${webhookTimestamp}.${webhookSignature}`;
    if (!provider.verifyWebhookSignature(rawBody ?? JSON.stringify(payload), signatureHeader)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = provider.parseWebhook(payload);
    await this.webhookService.handleWebhook(event, 'polar');

    return { success: true };
  }
}
