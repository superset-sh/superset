import type { License } from '@superbuilder/drizzle';

/**
 * 라이선스 상태 타입
 */
export type LicenseStatus = 'inactive' | 'active' | 'expired' | 'disabled';

/**
 * 라이선스 + 주문 정보
 */
export interface LicenseWithOrder extends License {
  order?: {
    id: string;
    orderNumber: number;
    total: number;
    currency: string;
  };
}

/**
 * 라이선스 검증 결과
 */
export interface LicenseValidationResult {
  valid: boolean;
  license?: License;
  meta?: {
    instanceId?: string;
    instanceName?: string;
  };
  error?: string;
}

/**
 * 라이선스 활성화 요청
 */
export interface ActivateLicenseRequest {
  licenseKey: string;
  instanceName?: string;
}

/**
 * 라이선스 비활성화 요청
 */
export interface DeactivateLicenseRequest {
  licenseKey: string;
  instanceId: string;
}
