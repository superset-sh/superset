import { Injectable, BadRequestException } from '@nestjs/common';
import type { EmailProvider, SendEmailOptions, SendEmailResult } from '../types';
import { ResendProvider } from '../providers';

/**
 * Email Provider Service
 *
 * 이메일 제공자 추상화 계층
 * 환경 변수에 따라 다른 제공자를 선택할 수 있음
 */
@Injectable()
export class EmailProviderService {
  private provider: EmailProvider;

  constructor() {
    const providerType = process.env.EMAIL_PROVIDER || 'resend';

    switch (providerType) {
      case 'resend':
        this.provider = new ResendProvider();
        break;
      default:
        throw new BadRequestException(`지원하지 않는 이메일 프로바이더: ${providerType}`);
    }
  }

  /**
   * 이메일 발송
   */
  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    return this.provider.send(options);
  }
}
