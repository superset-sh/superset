import { getI18n } from "./create-i18n";

/**
 * 컴포넌트 외부에서 번역을 가져오는 함수
 * (Zod 스키마, 상수 등에서 사용)
 *
 * @param namespace - Feature의 namespace (예: 'auth', 'blog')
 * @returns t 함수
 *
 * @example
 * ```tsx
 * import { getTranslation } from '@/core/i18n';
 *
 * const t = getTranslation('auth');
 *
 * const FORM_SCHEMA = z.object({
 *   email: z.string().email({
 *     message: t('signInEmailInvalid'),
 *   }),
 * });
 * ```
 */
export function getTranslation(namespace: string) {
  const i18n = getI18n();

  return (key: string, options?: Record<string, unknown>) => {
    return i18n.t(`${namespace}:${key}`, options);
  };
}
