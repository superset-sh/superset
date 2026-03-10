import { createHash } from 'crypto';
import { Injectable, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createLogger } from '../../../core/logger';
import { paymentConfig } from '../config/payment.config';
import type {
  InicisAuthResult,
  InicisApprovalResult,
  InicisCancelResponse,
} from '../types/inicis.types';
import { INICIS_ENDPOINTS, INICIS_ALLOWED_DOMAINS } from '../types/inicis.types';

const logger = createLogger('payment');

/**
 * KG이니시스 HTTP API 클라이언트
 *
 * - 승인 요청 (P_REQ_URL 호출)
 * - 취소 요청 (Cancel API V2)
 * - 해시 생성 유틸리티
 */
@Injectable()
export class InicisService {
  constructor(
    @Inject(paymentConfig.KEY)
    private config: ConfigType<typeof paymentConfig>,
  ) {}

  // ========== 승인 ==========

  /**
   * 모바일 결제 승인 요청
   * 인증 완료 후 P_REQ_URL로 승인 API를 호출하여 실제 결제를 완료한다.
   */
  async requestApproval(authResult: InicisAuthResult): Promise<InicisApprovalResult> {
    this.validateReqUrl(authResult.P_REQ_URL);

    const response = await fetch(authResult.P_REQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        P_TID: authResult.P_TID,
        P_MID: this.config.inicisMid,
      }).toString(),
    });

    if (!response.ok) {
      logger.error('INICIS approval request failed', {
        'payment.provider': 'inicis',
        'payment.tid': authResult.P_TID,
        'payment.order_id': authResult.P_OID,
        'error.message': `HTTP ${response.status}`,
      });
      throw new Error(`INICIS approval request failed: HTTP ${response.status}`);
    }

    const result = await this.parseFormResponse(await response.text());

    logger.info('INICIS approval completed', {
      'payment.provider': 'inicis',
      'payment.tid': result.P_TID,
      'payment.order_id': result.P_OID,
      'payment.status': result.P_STATUS,
      'payment.amount': result.P_AMT,
    });

    return result as unknown as InicisApprovalResult;
  }

  // ========== 네트워크 취소 (payNetCancel) ==========

  /**
   * 네트워크 장애 시 결제 취소
   * 승인 요청 중 네트워크 오류 발생 시 호출하여 불일치 상태를 방지한다.
   * 엔드포인트: {P_REQ_URL 호스트}/smart/payNetCancel.ini
   *
   * @param authResult 인증 결과 (P_TID, P_MID, P_AMT, P_OID, P_REQ_URL 필요)
   */
  async requestNetCancel(authResult: InicisAuthResult): Promise<void> {
    try {
      const reqUrl = new URL(authResult.P_REQ_URL);
      const netCancelUrl = `${reqUrl.origin}/smart/payNetCancel.ini`;

      this.validateReqUrl(netCancelUrl);

      const timestamp = Date.now().toString();
      const chkFake = this.createFakeCheckHash(
        authResult.P_AMT,
        authResult.P_OID,
        timestamp,
      );

      const response = await fetch(netCancelUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          P_TID: authResult.P_TID,
          P_MID: this.config.inicisMid,
          P_AMT: authResult.P_AMT,
          P_OID: authResult.P_OID,
          P_TIMESTAMP: timestamp,
          P_CHKFAKE: chkFake,
        }).toString(),
      });

      const result = await this.parseFormResponse(await response.text());

      if (result.P_STATUS === '00') {
        logger.info('INICIS network cancellation succeeded', {
          'payment.provider': 'inicis',
          'payment.tid': authResult.P_TID,
          'payment.order_id': authResult.P_OID,
        });
      } else {
        logger.error('INICIS network cancellation failed', {
          'payment.provider': 'inicis',
          'payment.tid': authResult.P_TID,
          'payment.status': result.P_STATUS,
          'payment.message': result.P_RMESG1,
        });
      }
    } catch (error) {
      logger.error('INICIS network cancellation request error', {
        'payment.provider': 'inicis',
        'payment.tid': authResult.P_TID,
        'error.message': error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ========== 취소 ==========

  /**
   * 결제 취소 (Cancel API V2 — JSON)
   * @param tid 거래번호
   * @param reason 취소 사유
   * @param amount 부분취소 금액 (없으면 전액취소)
   */
  async cancelPayment(
    tid: string,
    reason: string,
    amount?: number,
    paymethod: string = 'Card',
  ): Promise<InicisCancelResponse> {
    const type = amount ? 'PartialRefund' : 'Refund';
    const timestamp = this.createTimestamp();
    const clientIp = '10.0.0.1';
    const mid = this.config.inicisMid;

    const hashData = this.createCancelHash(
      type,
      paymethod,
      timestamp,
      clientIp,
      mid,
      tid,
    );

    const body: Record<string, unknown> = {
      type,
      paymethod,
      timestamp,
      clientIp,
      mid,
      tid,
      msg: reason,
      hashData,
    };

    if (amount) {
      body.price = amount;
    }

    const cancelUrl = this.isTestMode()
      ? INICIS_ENDPOINTS.CANCEL_API_TEST
      : INICIS_ENDPOINTS.CANCEL_API;

    const response = await fetch(cancelUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      logger.error('INICIS cancel request failed', {
        'payment.provider': 'inicis',
        'payment.tid': tid,
        'error.message': `HTTP ${response.status}`,
      });
      throw new Error(`INICIS cancel request failed: HTTP ${response.status}`);
    }

    const result = (await response.json()) as InicisCancelResponse;

    if (result.resultCode !== '00') {
      logger.error('INICIS cancel rejected', {
        'payment.provider': 'inicis',
        'payment.tid': tid,
        'payment.result_code': result.resultCode,
        'payment.result_msg': result.resultMsg,
      });
      throw new Error(`INICIS cancel failed: ${result.resultMsg} (${result.resultCode})`);
    }

    logger.info('INICIS payment cancelled', {
      'payment.provider': 'inicis',
      'payment.tid': tid,
      'payment.cancel_date': result.cancelDate,
    });

    return result;
  }

  // ========== Hash 유틸리티 ==========

  /**
   * 가격 위변조 방지 해시 생성
   * P_CHKFAKE = BASE64(SHA512(P_AMT + P_OID + P_TIMESTAMP + HashKey))
   */
  createFakeCheckHash(amount: string, orderId: string, timestamp: string): string {
    const hashKey = this.config.inicisHashKey;
    const raw = `${amount}${orderId}${timestamp}${hashKey}`;
    return Buffer.from(
      createHash('sha512').update(raw).digest('hex'),
    ).toString('base64');
  }

  /**
   * 취소 API V2 해시 생성
   * SHA512(INIAPIKey + type + paymethod + timestamp + clientIp + mid + tid)
   */
  private createCancelHash(
    type: string,
    paymethod: string,
    timestamp: string,
    clientIp: string,
    mid: string,
    tid: string,
  ): string {
    const iniApiKey = this.config.inicisSignKey;
    const raw = `${iniApiKey}${type}${paymethod}${timestamp}${clientIp}${mid}${tid}`;
    return createHash('sha512').update(raw).digest('hex');
  }

  /**
   * 타임스탬프 생성 (YYYYMMDDHHmmss)
   */
  private createTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join('');
  }

  /**
   * 테스트 모드 여부 (MID가 테스트용인지 확인)
   */
  private isTestMode(): boolean {
    return this.config.inicisMid === 'INIpayTest';
  }

  /**
   * P_REQ_URL 도메인 검증 (SSRF 방지)
   * INICIS 공식 도메인만 허용한다.
   */
  private validateReqUrl(url: string): void {
    try {
      const parsed = new URL(url);
      const isAllowed = INICIS_ALLOWED_DOMAINS.some(
        (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
      );
      if (!isAllowed) {
        logger.error('INICIS P_REQ_URL domain not allowed', {
          'payment.provider': 'inicis',
          'payment.req_url_host': parsed.hostname,
        });
        throw new Error(`INICIS P_REQ_URL domain not allowed: ${parsed.hostname}`);
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Invalid INICIS P_REQ_URL: ${url}`);
      }
      throw error;
    }
  }

  /**
   * URL-encoded form 응답 파싱
   */
  private async parseFormResponse(text: string): Promise<Record<string, string>> {
    const params = new URLSearchParams(text);
    const result: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      result[key] = value;
    }
    return result;
  }
}
