import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { render } from '@react-email/render';
import type { EmailTemplateType } from '@superbuilder/drizzle';
import * as templates from '../templates';

/**
 * Email Template Service
 *
 * React Email 컴포넌트를 HTML로 렌더링
 */
@Injectable()
export class EmailTemplateService {
  /**
   * 템플릿 렌더링
   */
  async render(templateType: EmailTemplateType, variables: Record<string, any>): Promise<string> {
    const Template = this.getTemplate(templateType);

    if (!Template) {
      throw new NotFoundException(`이메일 템플릿을 찾을 수 없습니다: ${templateType}`);
    }

    try {
      // React 컴포넌트를 HTML로 렌더링
      const html = render(Template(variables));
      return html;
    } catch (error) {
      console.error('[EmailTemplateService] Render failed:', error);
      throw new InternalServerErrorException(`이메일 템플릿 렌더링에 실패했습니다: ${templateType}`);
    }
  }

  /**
   * 템플릿 미리보기 (개발용)
   */
  async preview(templateType: EmailTemplateType, variables: Record<string, any>): Promise<string> {
    return this.render(templateType, variables);
  }

  /**
   * 템플릿 선택
   */
  private getTemplate(templateType: EmailTemplateType): ((props: any) => any) | null {
    switch (templateType) {
      case 'welcome':
        return templates.WelcomeEmail as any;
      case 'email-verification':
        return templates.EmailVerificationEmail as any;
      case 'password-reset':
        return templates.PasswordResetEmail as any;
      default:
        return null;
    }
  }
}
