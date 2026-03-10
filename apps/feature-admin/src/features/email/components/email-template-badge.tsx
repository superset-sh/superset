import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import type { EmailTemplateType } from '../types';
import { EMAIL_TEMPLATE_LABELS } from '../types';

interface EmailTemplateBadgeProps {
  templateType: EmailTemplateType;
}

/**
 * 이메일 템플릿 배지
 */
export function EmailTemplateBadge({ templateType }: EmailTemplateBadgeProps) {
  const label = EMAIL_TEMPLATE_LABELS[templateType];

  return (
    <Badge variant="outline" className="font-normal">
      {label}
    </Badge>
  );
}
