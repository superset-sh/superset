import {
  Controller,
  Post,
  Body,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { createLogger } from '../../../../core/logger';
import { InicisService } from '../../service/inicis.service';
import { WebhookService } from '../../service/webhook.service';
import type { InicisAuthResult } from '../../types/inicis.types';

const logger = createLogger('payment');

/**
 * INICIS 모바일 표준결제 콜백 컨트롤러
 *
 * 결제 인증 완료 후 INICIS가 P_NEXT_URL로 리다이렉트하면
 * 이 컨트롤러에서 승인 요청을 처리한다.
 *
 * Flow: 사용자 → INICIS 결제창 → 인증완료 → P_NEXT_URL(여기) → 승인요청 → 결과 리다이렉트
 */
@ApiTags('Payment INICIS')
@Controller('payment/inicis')
export class InicisCallbackController {
  constructor(
    private readonly inicisService: InicisService,
    private readonly webhookService: WebhookService,
  ) {}

  /**
   * INICIS 모바일 결제 인증 콜백 (P_NEXT_URL)
   *
   * INICIS가 인증 결과를 POST로 전달한다.
   * 성공 시 P_REQ_URL로 승인 요청을 보내고, 결과에 따라 클라이언트를 리다이렉트한다.
   */
  @Post('callback')
  @ApiOperation({ summary: 'INICIS 모바일 결제 인증 콜백 (P_NEXT_URL)' })
  @ApiResponse({ status: 302, description: '결제 결과 페이지로 리다이렉트' })
  @ApiResponse({ status: 400, description: '인증 실패' })
  async handleCallback(
    @Body() authResult: InicisAuthResult,
    @Res() reply: FastifyReply,
  ) {
    // 인증 실패
    if (authResult.P_STATUS !== '00') {
      logger.warn('INICIS auth failed', {
        'payment.provider': 'inicis',
        'payment.order_id': authResult.P_OID,
        'payment.status': authResult.P_STATUS,
        'payment.message': authResult.P_RMESG1,
      });

      // 실패 시 에러 정보를 포함하여 리다이렉트
      const errorParams = new URLSearchParams({
        status: 'failed',
        message: authResult.P_RMESG1 ?? 'Payment authentication failed',
        orderId: authResult.P_OID,
      });

      // P_NOTI에 저장된 customData에서 redirect URL 추출 (상대 경로만 허용)
      const customData = this.parseNotiData(authResult.P_NOTI);
      const failUrl = this.sanitizeRedirectUrl(customData?.failUrl, '/payment/result');

      return reply.status(302).redirect(`${failUrl}?${errorParams.toString()}`);
    }

    // 승인 요청
    try {
      const approvalResult = await this.inicisService.requestApproval(authResult);

      if (approvalResult.P_STATUS !== '00') {
        throw new BadRequestException(
          `INICIS approval failed: ${approvalResult.P_RMESG1}`,
        );
      }

      // 결제 성공 이벤트 처리
      await this.webhookService.handleWebhook(
        {
          eventType: 'order_created',
          externalId: approvalResult.P_TID,
          data: approvalResult,
          customData: this.parseNotiData(approvalResult.P_NOTI) ?? undefined,
          testMode: false,
        },
        'inicis',
      );

      // 성공 리다이렉트
      const successParams = new URLSearchParams({
        status: 'success',
        tid: approvalResult.P_TID,
        orderId: approvalResult.P_OID,
        amount: approvalResult.P_AMT,
      });

      const customData = this.parseNotiData(approvalResult.P_NOTI);
      const successUrl = this.sanitizeRedirectUrl(customData?.successUrl, '/payment/result');

      return reply.status(302).redirect(`${successUrl}?${successParams.toString()}`);
    } catch (error) {
      logger.error('INICIS approval failed', {
        'payment.provider': 'inicis',
        'payment.tid': authResult.P_TID,
        'payment.order_id': authResult.P_OID,
        'error.message': error instanceof Error ? error.message : String(error),
      });

      // 네트워크 장애 시 결제 취소 요청 (불일치 상태 방지)
      await this.inicisService.requestNetCancel(authResult);

      const errorParams = new URLSearchParams({
        status: 'failed',
        message: error instanceof Error ? error.message : 'Payment approval failed',
        orderId: authResult.P_OID,
      });

      const customData = this.parseNotiData(authResult.P_NOTI);
      const failUrl = this.sanitizeRedirectUrl(customData?.failUrl, '/payment/result');

      return reply.status(302).redirect(`${failUrl}?${errorParams.toString()}`);
    }
  }

  /**
   * P_NOTI 데이터 파싱
   * JSON 문자열로 저장된 사용자 정의 데이터를 파싱한다.
   */
  private parseNotiData(noti?: string): Record<string, string> | null {
    if (!noti) return null;
    try {
      return JSON.parse(noti) as Record<string, string>;
    } catch {
      return null;
    }
  }

  /**
   * 리다이렉트 URL 검증 (Open Redirect 방지)
   * 상대 경로만 허용하고 외부 URL은 차단한다.
   */
  private sanitizeRedirectUrl(url: string | undefined, fallback: string): string {
    if (!url) return fallback;
    // 상대 경로만 허용: /로 시작하고 //로 시작하지 않아야 함
    if (url.startsWith('/') && !url.startsWith('//')) {
      return url;
    }
    logger.warn('INICIS redirect URL blocked (not a relative path)', {
      'payment.provider': 'inicis',
      'payment.blocked_url': url,
    });
    return fallback;
  }
}
