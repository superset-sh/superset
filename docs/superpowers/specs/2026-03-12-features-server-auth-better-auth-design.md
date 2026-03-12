# features-server Auth: Supabase → Better Auth 전환 설계

## 배경

`packages/features-server/`는 feature-atlas에서 통합된 독립 패키지로, 다른 시스템에 설치되어 동작한다. 현재 Supabase JWT 기반 인증을 사용하며, 이를 Better Auth + Neon으로 전환한다. 프로젝트별로 독립적인 Neon/Vercel 환경에서 운영되므로 환경변수 기반 직접 인스턴스 방식을 사용한다.

## 범위

- 회원가입, 로그인, 비밀번호 찾기/재설정, 세션 관리
- Organization 플러그인 (멀티 테넌시, 멤버 초대, 역할)
- OAuth (Google, GitHub)
- RBAC: `userRoles`/`roles` 테이블 → Better Auth `members.role` 전환
- 패키지 리네이밍: `@superbuilder/drizzle` → `@superbuilder/features-db`

## 범위 외

- file-manager Supabase Storage 마이그레이션
- agent-desk Supabase 참조 제거
- `role-permission` feature 전체 리팩토링/제거
- 프론트엔드(features-client) auth UI 전환

## 설계

### 1. 패키지 리네이밍

`@superbuilder/drizzle` → `@superbuilder/features-db`

- `packages/drizzle/package.json`의 `name` 변경
- features-server 전체에서 import 경로 일괄 변경
- Better Auth 스키마를 features-db에 추가

### 2. Better Auth 스키마 (features-db)

Superset `packages/db/src/schema/auth.ts` 패턴을 따라 features-db에 Better Auth 호환 스키마 정의:

```
packages/drizzle/src/schema/core/auth.ts  (새 파일 또는 기존 파일 교체)
```

포함 테이블:
- `users` — id, name, email, emailVerified, image, createdAt, updatedAt
- `sessions` — id, token, expiresAt, userId, activeOrganizationId, ipAddress, userAgent
- `accounts` — id, accountId, providerId, userId, accessToken, refreshToken, password
- `verifications` — id, identifier, value, expiresAt
- `organizations` — id, name, slug, logo, createdAt, metadata
- `members` — id, organizationId, userId, role, createdAt
- `invitations` — id, organizationId, email, role, status, expiresAt, inviterId

기존 `profiles` 테이블은 Better Auth `users`로 대체. FK 참조하는 기존 feature 테이블은 `users.id`로 전환.

### 3. Better Auth 서버 (`core/auth/`)

```
packages/features-server/core/auth/
├── server.ts          # betterAuth() 인스턴스 (env 기반)
├── client.ts          # createAuthClient() (React 클라이언트)
├── env.ts             # 환경변수 검증
└── index.ts
```

**server.ts** — 환경변수 기반 직접 인스턴스:

```typescript
export const auth = betterAuth({
  baseURL: env.API_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    storeSessionInDatabase: true,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  socialProviders: {
    github: { clientId: env.GH_CLIENT_ID, clientSecret: env.GH_CLIENT_SECRET },
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
  },
  plugins: [
    organization({ creatorRole: "owner" }),
    jwt({
      jwks: { keyPairConfig: { alg: "RS256" } },
      jwt: {
        issuer: env.API_URL,
        audience: env.API_URL,
        expirationTime: "1h",
        definePayload: async ({ user }) => ({
          sub: user.id,
          email: user.email,
          organizationIds,  // members 테이블에서 조회
        }),
      },
    }),
  ],
});
```

**env.ts** — 필수 환경변수:

```
BETTER_AUTH_SECRET, API_URL, DATABASE_URL,
GH_CLIENT_ID, GH_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
```

### 4. NestJS Auth Guard 전환

**jwt-parser.ts** (교체):
- 기존: Base64 디코딩만 (서명 검증 없음, Supabase 기준)
- 변경: JWKS endpoint에서 공개키 캐싱 + RS256 서명 검증
- payload에서 `{ sub, email, organizationIds }` 추출

**JwtAuthGuard** (변경 최소):
- 내부적으로 새 jwt-parser 사용, 인터페이스 동일

**AdminGuard** (전환):
- 기존: `userRoles` JOIN `roles` → slug 확인
- 변경: Better Auth `members` 테이블에서 activeOrganizationId 기반 role 확인
- `owner`, `admin` role이면 통과

### 5. tRPC Context/Procedure 전환

**User 타입:**
```typescript
export interface User {
  id: string;
  email?: string;
  organizationIds?: string[];
}
```

`role`, `roleIds` 필드 제거. Organization role은 필요 시 members 테이블에서 조회.

**BaseTRPCContext:**
- `roleService`, `permissionService`, `authService` 제거
- `db`, `user` 유지

**adminProcedure:**
- `userRoles`/`roles` 기반 → `members` 테이블에서 현재 사용자의 role 확인으로 변경

### 6. RBAC 모델 전환

| Before | After |
|--------|-------|
| `roles` 테이블 | Better Auth `members.role` |
| `userRoles` 테이블 (N:M) | `members` 테이블 (org별 단일 role) |
| `permissions` 테이블 | 제거 (YAGNI) |
| `rolePermissions` 테이블 | 제거 (YAGNI) |
| slug 기반 (`owner`, `admin`) | role 문자열 (`owner`, `admin`, `member`) |

기존 `roles`/`userRoles` 테이블은 당장 DROP하지 않고 유지. features-server 코드에서 참조만 제거.

### 7. 기존 feature 영향

| Feature | 영향 | 대응 |
|---------|------|------|
| `profile` | `TODO: Supabase Auth 연동` 코멘트 있음 | Better Auth `users` 테이블로 전환 |
| `role-permission` | Guard/Procedure에서 사용 중 | Guard 전환 후 feature 내부 로직은 유지, Admin Guard만 분리 |
| `payment` (inicis) | Supabase URL 참조 | env 기반으로 URL 변경 |
| 기타 features | `@superbuilder/drizzle` import | `@superbuilder/features-db`로 일괄 변경 |

### 8. 워크트리에서 작업

별도 git worktree에서 작업. `.env`를 복사하여 독립 환경 구성.
