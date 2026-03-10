# Atlas Composer → Deploy Pipeline 구현 계획

> **원래 요청**: "Composer → 프로젝트 생성 → Git 생성 → Supabase 프로젝트 생성 → Vercel 배포 → 배포 목록(운영/모니터링)"

---

## 전체 아키텍처

```
Feature Catalog ──→ Composer Wizard ──→ Pipeline
                    (feature 선택)       │
                                         ├─ Extract (파일 추출)
                                         ├─ Git Init
                                         ├─ Supabase (DB 생성)
                                         ├─ Vercel (프론트 배포)
                                         └─→ Deployments (목록/모니터링)
```

### tRPC Router 구조

```
atlas/
├── registry    — Feature 조회
├── resolver    — 의존성 해석
├── composer    — extract + git init
├── supabase    — PAT 토큰 + 프로젝트 생성
├── vercel      — PAT 토큰 + 배포
└── deployments — 프로젝트 목록 CRUD
```

### 파일 구조

```
apps/desktop/src/
├── lib/
│   ├── atlas-mcp-tools.ts                    # Agent용 Mastra Tool 정의
│   └── trpc/routers/atlas/
│       ├── registry.ts
│       ├── resolver.ts
│       ├── composer.ts
│       ├── supabase.ts
│       ├── vercel.ts
│       ├── deployments.ts
│       └── index.ts
├── renderer/
│   ├── routes/_authenticated/_dashboard/atlas/
│   │   ├── catalog/page.tsx
│   │   ├── composer/page.tsx       # 파이프라인 UI 통합
│   │   └── deployments/page.tsx
│   └── screens/atlas/components/
│       ├── AtlasSidebar.tsx
│       ├── ComposerStepper.tsx     # 6단계 스텝퍼
│       ├── PipelineProgress.tsx    # 진행 상황 UI
│       ├── FeatureSelector.tsx
│       ├── ResolutionPreview.tsx
│       ├── ProjectConfig.tsx
│       ├── SupabaseSetup.tsx       # Supabase PAT + Org 선택
│       ├── VercelSetup.tsx         # Vercel PAT + Team 선택
│       ├── DeploymentCard.tsx      # 프로젝트 카드
│       └── DependencyGraph.tsx
packages/
├── local-db/src/schema/atlas.ts    # atlasProjects, atlasIntegrations
└── chat-mastra/src/server/trpc/service.ts  # getExtraTools 인터페이스
```

---

## Phase 1: Foundation (기반 구축) — ✅ 완료

| 작업 | 상태 | 파일 |
|------|:---:|------|
| Feature Atlas registry 확장 | ✅ | `registry.ts` |
| 의존성 해결 알고리즘 (토폴로지 정렬 + 순환 감지) | ✅ | `resolver.ts` |
| DB 스키마 (atlasProjects, atlasIntegrations) | ✅ | `packages/local-db/src/schema/atlas.ts` |
| Git init (composer에서 처리) | ✅ | `composer.ts` |
| Deployments CRUD (list, getById, delete, updateStatus) | ✅ | `deployments.ts` |
| Pipeline UI (ComposerStepper 6단계, PipelineProgress) | ✅ | 컴포넌트 구현 완료 |
| Deployments 페이지 (카드 그리드, 빈 상태, 폴더 열기) | ✅ | `deployments/page.tsx` |
| Atlas Router 통합 (6개 라우터 등록) | ✅ | `atlas/index.ts` |

---

## Phase 2: Supabase 연동 — ✅ 완료

| 작업 | 상태 | 파일 |
|------|:---:|------|
| PAT 토큰 저장/검증 (AES-256-GCM 암호화) | ✅ | `supabase.ts` — saveToken |
| 토큰 삭제 | ✅ | `supabase.ts` — removeToken |
| 연결 상태 확인 | ✅ | `supabase.ts` — getConnectionStatus |
| Organization 목록 조회 | ✅ | `supabase.ts` — listOrganizations |
| 프로젝트 생성 + atlasProjects 업데이트 | ✅ | `supabase.ts` — createProject |
| Health check 폴링 (30회 × 5초) | ✅ | `supabase.ts` — waitForHealthy |
| API 키 조회 (anon + service_role) | ✅ | `supabase.ts` — getApiKeys |
| .env 파일 자동 작성 | ✅ | `supabase.ts` — writeEnvFile |
| SupabaseSetup UI (토큰 입력 → Org 선택) | ✅ | `SupabaseSetup.tsx` |
| Composer 파이프라인 통합 (supabasePhase 상태 관리) | ✅ | `composer/page.tsx` |

### 에러 처리 정책
- Supabase 실패 시 "나중에 연결" 버튼으로 건너뛰기 가능
- 건너뛰어도 프로젝트 자체는 생성된 상태 유지

---

## Phase 3: Vercel 연동 — ✅ 완료

| 작업 | 상태 | 파일 |
|------|:---:|------|
| PAT 토큰 저장/검증 | ✅ | `vercel.ts` — saveToken |
| 토큰 삭제 | ✅ | `vercel.ts` — removeToken |
| 연결 상태 확인 | ✅ | `vercel.ts` — getConnectionStatus |
| Team 목록 조회 | ✅ | `vercel.ts` — listTeams |
| 프로젝트 생성 + atlasProjects 업데이트 | ✅ | `vercel.ts` — createProject |
| 도메인 생성 | ✅ | `vercel.ts` — generateDomain |
| 배포 실행 + atlasProjects 업데이트 | ✅ | `vercel.ts` — deploy |
| 배포 완료 대기 (60회 × 3초) | ✅ | `vercel.ts` — waitForReady |
| VercelSetup UI (토큰 입력 → Team/개인 선택) | ✅ | `VercelSetup.tsx` |
| Composer 파이프라인 통합 (vercelPhase 상태 관리) | ✅ | `composer/page.tsx` |
| DeploymentCard에 Supabase/Vercel URL 표시 | ✅ | `DeploymentCard.tsx` |

### 에러 처리 정책
- Vercel 실패 시 "나중에 배포" 버튼으로 건너뛰기 가능

---

## Phase 3.5: MCP Agent Tools — ✅ 완료 (추가 작업)

> Agent Chat에서 Supabase/Vercel 작업을 자연어로 요청할 수 있도록 Mastra Tool 주입

| 작업 | 상태 | 파일 |
|------|:---:|------|
| `ChatMastraServiceOptions`에 `getExtraTools` 추가 | ✅ | `packages/chat-mastra/src/server/trpc/service.ts` |
| Atlas MCP Tools 정의 (11개) | ✅ | `apps/desktop/src/lib/atlas-mcp-tools.ts` |
| ChatMastraService 인스턴스에 연결 | ✅ | `lib/trpc/routers/chat-mastra-service/index.ts` |

### 정의된 Tool 목록

| Tool ID | 설명 |
|---------|------|
| `atlas_supabase_status` | Supabase 연결 상태 확인 |
| `atlas_supabase_list_organizations` | Supabase 조직 목록 |
| `atlas_supabase_create_project` | Supabase 프로젝트 생성 |
| `atlas_supabase_get_api_keys` | API 키 조회 |
| `atlas_supabase_write_env` | .env 파일 작성 |
| `atlas_vercel_status` | Vercel 연결 상태 확인 |
| `atlas_vercel_list_teams` | Vercel 팀 목록 |
| `atlas_vercel_create_project` | Vercel 프로젝트 생성 |
| `atlas_vercel_deploy` | Vercel 배포 실행 |
| `atlas_vercel_get_deployment` | 배포 상태 확인 |
| `atlas_list_projects` | Atlas 프로젝트 목록 조회 |

---

## Phase 4: Deploy + Monitor — ❌ 미완료

> 배포 자동화 후 운영/모니터링 대시보드

### 4-1. 실시간 상태 동기화

| 작업 | 상태 | 설명 |
|------|:---:|------|
| Deployments 페이지 진입 시 상태 동기화 | ❌ | Vercel API로 readyState, Supabase health 조회 후 DB 업데이트 |
| 상태 뱃지 세분화 | ❌ | `created` / `deploying` / `deployed` / `error` / `paused` |
| 자동 폴링 (옵션) | ❌ | 30초~1분 간격으로 상태 갱신 |

### 4-2. 재배포/재시도 플로우

| 작업 | 상태 | 설명 |
|------|:---:|------|
| DeploymentCard에 "재배포" 버튼 | ❌ | Vercel 재배포 트리거 |
| 건너뛴 단계 재시도 | ❌ | Supabase 미연결 프로젝트에 "Supabase 연결" 버튼 |
| Vercel 미배포 프로젝트에 "배포" 버튼 | ❌ | |

### 4-3. Monitor Dashboard

| 작업 | 상태 | 설명 |
|------|:---:|------|
| Vercel 배포 로그 뷰어 | ❌ | Vercel API `/v2/deployments/{id}/events` |
| Supabase 프로젝트 health 표시 | ❌ | Supabase API `/projects/{ref}/health` |
| 환경변수 동기화 상태 | ❌ | .env 파일 존재 여부 + 키 목록 표시 |
| 기본 메트릭 (옵션) | ❌ | Vercel analytics, Supabase DB 크기 등 |

### 4-4. 환경변수 관리

| 작업 | 상태 | 설명 |
|------|:---:|------|
| 프로젝트별 환경변수 조회 | ❌ | .env 파일 파싱 + 표시 |
| Vercel 환경변수 동기화 | ❌ | Vercel API로 env vars 푸시 |

---

## Phase 5: Feature Update (선택적 업데이트) — ❌ 미구현

> Feature Atlas 업데이트를 기존 프로젝트에 반영

| 작업 | 상태 | 설명 |
|------|:---:|------|
| Feature 단위 diff 생성 | ❌ | sourceVersion vs 최신 버전 비교 |
| 선택적 merge | ❌ | 변경된 feature만 업데이트, 커스터마이징 보존 |
| Breaking change 감지 | ❌ | 스키마 변경, API 변경 시 경고 |

---

## 진행 현황 요약

```
Phase 1 (Foundation)      ████████████████████  100% ✅
Phase 2 (Supabase)        ████████████████████  100% ✅
Phase 3 (Vercel)          ████████████████████  100% ✅
Phase 3.5 (MCP Tools)     ████████████████████  100% ✅
Phase 4 (Deploy+Monitor)  ████░░░░░░░░░░░░░░░░   20% ❌ (목록만 있고 모니터링 없음)
Phase 5 (Feature Update)  ░░░░░░░░░░░░░░░░░░░░    0% ❌ (미착수)
```

**다음 작업**: Phase 4 (Deploy + Monitor) 구현
