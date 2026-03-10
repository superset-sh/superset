# i18n (Internationalization)

React 프로젝트에서 다국어 지원을 위한 i18next 설정 모듈입니다.
Feature별 namespace를 지원하여 번역 파일을 분리 관리할 수 있습니다.

## 설치된 의존성

- `i18next` - 핵심 i18n 라이브러리
- `react-i18next` - React 바인딩

## 파일 구조

```
src/core/i18n/
├── index.ts                    # 메인 export
├── types.ts                    # 타입 정의
├── create-i18n.ts              # i18n 인스턴스 생성
├── use-feature-translation.ts  # useTranslation 래퍼
└── get-translation.ts          # 컴포넌트 외부용 t 함수
```

## 사용 방법

### 1. 프로젝트에서 i18n 초기화

```tsx
// app/i18n.ts
import { createI18n } from '@/core/i18n';
import authKo from '@/features/auth/locales/ko.json';
import authEn from '@/features/auth/locales/en.json';

export const i18n = createI18n({
  defaultLanguage: 'ko',
  resources: {
    ko: { auth: authKo },
    en: { auth: authEn },
  },
});
```

### 2. Provider 설정

```tsx
// main.tsx
import { I18nextProvider } from '@/core/i18n';
import { i18n } from './i18n';

<I18nextProvider i18n={i18n}>
  <App />
</I18nextProvider>
```

### 3. 컴포넌트에서 사용

```tsx
import { useFeatureTranslation } from '@/core/i18n';

function SignInForm() {
  const { t } = useFeatureTranslation('auth');
  
  return (
    <div>
      <p>{t('signInEmailInvalid')}</p>
      <input placeholder={t('signInEmailPlaceholder')} />
    </div>
  );
}
```

### 4. 컴포넌트 외부에서 사용 (Zod 스키마 등)

```tsx
import { getTranslation } from '@/core/i18n';

const t = getTranslation('auth');

const FORM_SCHEMA = z.object({
  email: z.string().email({
    message: t('signInEmailInvalid'),
  }),
});
```

## Feature별 번역 파일 구조

각 Feature는 `locales/` 폴더에 언어별 JSON 파일을 가집니다:

```
src/features/auth/
└── locales/
    ├── ko.json
    └── en.json
```

### 번역 파일 예시

```json
// src/features/auth/locales/ko.json
{
  "signInEmailInvalid": "유효하지 않은 이메일 주소입니다.",
  "signInPasswordRequired": "비밀번호를 입력해주세요.",
  "signInEmailPlaceholder": "이메일 주소를 입력해주세요",
  "signInSuccess": "로그인 성공!"
}
```

## API Reference

### `createI18n(config)`

새로운 i18n 인스턴스를 생성합니다.

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `defaultLanguage` | `'ko' \| 'en'` | `'ko'` | 기본 언어 |
| `fallbackLanguage` | `'ko' \| 'en'` | `'ko'` | 폴백 언어 |
| `resources` | `I18nResources` | - | 번역 리소스 |
| `debug` | `boolean` | `false` | 디버그 모드 |

### `useFeatureTranslation(namespace)`

Feature별 번역 훅입니다.

```tsx
const { t, i18n } = useFeatureTranslation('auth');
```

### `getTranslation(namespace)`

컴포넌트 외부에서 번역을 가져오는 함수입니다.

```tsx
const t = getTranslation('auth');
t('signInEmailInvalid'); // "유효하지 않은 이메일 주소입니다."
```

### `getOrCreateI18n(config)`

싱글톤 패턴으로 i18n 인스턴스를 생성하거나 기존 인스턴스를 반환합니다.

### `getI18n()`

전역 i18n 인스턴스를 반환합니다. 초기화되지 않은 경우 에러를 발생시킵니다.
