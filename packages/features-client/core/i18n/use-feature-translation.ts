import { useTranslation as useI18nextTranslation } from "react-i18next";

/**
 * Feature별 번역 훅
 *
 * @param namespace - Feature의 namespace (예: 'auth', 'blog')
 * @returns 해당 namespace의 t 함수와 i18n 인스턴스
 *
 * @example
 * ```tsx
 * import { useFeatureTranslation } from '@/core/i18n';
 *
 * function SignInForm() {
 *   const { t } = useFeatureTranslation('auth');
 *
 *   return (
 *     <div>
 *       <p>{t('signInEmailInvalid')}</p>
 *       <input placeholder={t('signInEmailPlaceholder')} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useFeatureTranslation(namespace: string) {
  return useI18nextTranslation(namespace);
}
