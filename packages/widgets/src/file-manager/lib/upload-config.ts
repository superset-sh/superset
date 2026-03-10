/**
 * File Upload 설정 모듈
 *
 * Widget은 앱 로컬 env에 직접 접근할 수 없으므로,
 * 앱 초기화 시 API URL을 설정해야 한다.
 *
 * @example
 * // apps/app/src/main.tsx
 * import { configureFileUpload } from "@superbuilder/widgets/file-manager";
 * configureFileUpload({ apiUrl: import.meta.env.VITE_API_URL });
 */
import { TOKEN_STORAGE_KEY } from "@superbuilder/features-client/core/auth";
import { getSessionHeaders } from "@superbuilder/features-client/core/logger/client";

let _apiUrl = "http://localhost:3002";

export function configureFileUpload(config: { apiUrl: string }) {
  _apiUrl = config.apiUrl;
}

export function getApiUrl(): string {
  return _apiUrl;
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    const token = raw ? JSON.parse(raw) : null;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore parse errors
  }

  Object.assign(headers, getSessionHeaders());

  return headers;
}
