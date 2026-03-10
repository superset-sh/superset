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
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  @Post('lemon-squeezy')
  @ApiOperation({ summary: 'Lemon Squeezy 웹훅 수신' })
  @ApiResponse({ status: 200, description: '웹훅 처리 성공' })
  @ApiResponse({ status: 400, description: '잘못된 웹훅 서명' })
  async handleLemonSqueezyWebhook(
    @Req() req: FastifyRequest,
    @Body() payload: unknown,
    @Headers('x-signature') signature: string,
  ) {
    const provider = this.providerFactory.getByName('lemon-squeezy');

    // raw body로 서명 검증 (Fastify rawBody 플러그인 또는 fallback)
    const rawBody = (req as any).rawBody as string | undefined;
    if (!provider.verifyWebhookSignature(rawBody ?? JSON.stringify(payload), signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = provider.parseWebhook(payload);
    await this.webhookService.handleWebhook(event, 'lemon-squeezy');

    return { success: true };
  }
}
