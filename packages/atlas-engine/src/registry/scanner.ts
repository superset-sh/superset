import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import type {
  FeatureRegistry,
  FeatureEntry,
  FeatureType,
  RouterMapping,
} from "./types";

/**
 * app-router.ts에서 router key 매핑 파싱
 *
 * NOTE: onboarding은 widget이지만 tRPC router가 없어 제외.
 * registry에 등록되지 않으며, 다른 feature의 dependency로도 참조하지 않는다.
 */
const ROUTER_KEY_MAP: Record<string, RouterMapping> = {
  "hello-world": { key: "helloWorld", import: "helloWorldRouter", from: "@repo/features/hello-world" },
  "comment": { key: "comment", import: "commentRouter", from: "@repo/features/comment" },
  "board": { key: "board", import: "boardRouter", from: "@repo/features/board" },
  "review": { key: "review", import: "reviewRouter", from: "@repo/features/review" },
  "community": { key: "community", import: "communityMainRouter", from: "@repo/features/community" },
  "payment": { key: "payment", import: "paymentRouter", from: "@repo/features/payment" },
  "profile": { key: "profile", import: "profileRouter", from: "@repo/features/profile" },
  "notification": { key: "notification", import: "notificationRouter", from: "@repo/features/notification" },
  "reaction": { key: "reaction", import: "reactionRouter", from: "@repo/features/reaction" },
  "role-permission": { key: "rolePermission", import: "rolePermissionRouter", from: "@repo/features/role-permission" },
  "email": { key: "email", import: "emailRouter", from: "@repo/features/email" },
  "ai": { key: "ai", import: "aiRouter", from: "@repo/features/ai" },
  "marketing": { key: "marketing", import: "marketingMainRouter", from: "@repo/features/marketing" },
  "scheduled-job": { key: "scheduledJob", import: "scheduledJobRouter", from: "@repo/features/scheduled-job" },
  "audit-log": { key: "auditLog", import: "auditLogRouter", from: "@repo/features/audit-log" },
  "analytics": { key: "analytics", import: "analyticsRouter", from: "@repo/features/analytics" },
  "content-studio": { key: "contentStudio", import: "contentStudioRouter", from: "@repo/features/content-studio" },
  "file-manager": { key: "fileManager", import: "fileManagerRouter", from: "@repo/features/file-manager" },
  "course": { key: "course", import: "courseRouter", from: "@repo/features/course" },
  "booking": { key: "booking", import: "bookingMainRouter", from: "@repo/features/booking" },
  "data-tracker": { key: "dataTracker", import: "dataTrackerRouter", from: "@repo/features/data-tracker" },
  "family": { key: "family", import: "familyRouter", from: "@repo/features/family" },
  "agent-desk": { key: "agentDesk", import: "agentDeskRouter", from: "@repo/features/agent-desk" },
  "ai-image": { key: "aiImage", import: "aiImageRouter", from: "@repo/features/ai-image" },
  "task": { key: "task", import: "taskRouter", from: "@repo/features/task" },
  "blog": { key: "blog", import: "blogRouter", from: "@repo/features/blog" },
  "story-studio": { key: "storyStudio", import: "storyStudioRouter", from: "@repo/features/story-studio" },
  "coupon": { key: "coupon", import: "couponRouter", from: "@repo/features/coupon" },
  "bookmark": { key: "bookmark", import: "bookmarkRouter", from: "@repo/features/bookmark" },
  "feature-catalog": { key: "featureCatalog", import: "featureCatalogRouter", from: "@repo/features/feature-catalog" },
};

/** Widget features (packages/widgets/src/ 하위) */
const WIDGET_FEATURES = new Set([
  "bookmark", "comment", "file-manager", "notification",
  "onboarding", "reaction", "review",
]);

/** Agent features (agent-server에 코드가 있는 features) */
const AGENT_FEATURES = new Set(["agent-desk", "ai", "ai-image"]);

/** 항상 포함되는 core features (auth는 Supabase 인프라이므로 제외, profile만) */
const CORE_FEATURES = ["profile", "role-permission"];

/**
 * NOTE: `auth`는 @repo/core/auth에 위치하며 packages/features/에 별도 디렉토리가 없다.
 * Core 인프라로 모든 프로젝트에 자동 포함되므로 registry에 등록하지 않는다.
 * OAuth provider는 Better Auth genericOAuth 플러그인으로 처리한다.
 */

/** Feature Atlas packages/features/ 하위 디렉토리 스캔 */
export function scanFeatureDirectory(atlasPath: string): string[] {
  const featuresDir = join(atlasPath, "packages/features");
  if (!existsSync(featuresDir)) return [];

  return readdirSync(featuresDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort();
}

/** feature 타입 판별 */
function detectFeatureType(name: string): FeatureType {
  if (AGENT_FEATURES.has(name)) return "agent";
  if (WIDGET_FEATURES.has(name)) return "widget";
  return "page";
}

/** feature 그룹 판별 */
function detectFeatureGroup(name: string): string {
  const groupMap: Record<string, string> = {
    "profile": "core", "role-permission": "core",
    "blog": "content", "content-studio": "content", "story-studio": "content",
    "marketing": "content", "feature-catalog": "content",
    "payment": "commerce", "booking": "commerce", "course": "commerce",
    "coupon": "commerce",
    "community": "community", "board": "community", "comment": "community",
    "reaction": "community", "review": "community", "bookmark": "community",
    "analytics": "system", "audit-log": "system", "scheduled-job": "system",
    "email": "system", "notification": "system", "file-manager": "system",
    "ai": "system", "ai-image": "system", "agent-desk": "system",
    "data-tracker": "system", "family": "system", "task": "system",
    "hello-world": "template",
  };
  return groupMap[name] ?? "system";
}

/** Schema 디렉토리명 → feature 디렉토리명 매핑 (불일치하는 경우만) */
const SCHEMA_DIR_MAP: Record<string, string> = {
  "agent-desk": "agent-desk", // schema dir = "agent-desk"
  "ai": "agent",              // schema dir = "agent" (불일치)
};

/** Schema 테이블명 스캔 (index.ts에서 pgTable 호출 추출) */
function scanSchemaTables(atlasPath: string, featureName: string): string[] {
  // schema 디렉토리명이 feature 디렉토리명과 다를 수 있음
  const schemaDirName = SCHEMA_DIR_MAP[featureName] ?? featureName;
  const schemaPath = join(atlasPath, "packages/drizzle/src/schema/features", schemaDirName, "index.ts");
  if (!existsSync(schemaPath)) return [];

  try {
    const content = readFileSync(schemaPath, "utf-8");
    const matches = content.match(/pgTable\(\s*["']([^"']+)["']/g);
    if (!matches) return [];
    return matches.map((m) => {
      const match = m.match(/pgTable\(\s*["']([^"']+)["']/);
      return match ? match[1] : "";
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/** Feature Atlas 코드베이스를 분석하여 Registry 초안 생성 */
export function buildRegistryFromScan(atlasPath: string): FeatureRegistry {
  const featureNames = scanFeatureDirectory(atlasPath);
  const features: Record<string, FeatureEntry> = {};

  for (const name of featureNames) {
    const type = detectFeatureType(name);
    const routerMapping = ROUTER_KEY_MAP[name];

    if (!routerMapping) continue; // router 매핑이 없으면 skip

    const schemaDirName = SCHEMA_DIR_MAP[name] ?? name;
    const hasSchema = existsSync(
      join(atlasPath, "packages/drizzle/src/schema/features", schemaDirName)
    );
    const hasClientApp = existsSync(
      join(atlasPath, "apps/app/src/features", name)
    );
    const hasClientAdmin = existsSync(
      join(atlasPath, "apps/feature-admin/src/features", name)
    );
    const hasWidget = existsSync(
      join(atlasPath, "packages/widgets/src", name)
    );

    const entry: FeatureEntry = {
      name,
      type,
      icon: "Box",
      group: detectFeatureGroup(name) as any,
      description: "",

      dependencies: [],
      optionalDependencies: [],

      router: routerMapping,
      server: {
        module: `packages/features/${name}/${name}.module.ts`,
        router: `packages/features/${name}/${name}.router.ts`,
        controller: `packages/features/${name}/controller/`,
      },
      client: {
        ...(hasClientApp ? { app: `apps/app/src/features/${name}/` } : {}),
        ...(hasClientAdmin ? { admin: `apps/feature-admin/src/features/${name}/` } : {}),
      },
      schema: {
        tables: hasSchema ? scanSchemaTables(atlasPath, name) : [],
        path: hasSchema ? `packages/drizzle/src/schema/features/${schemaDirName}/` : "",
      },

      ...(type === "widget" && hasWidget
        ? {
            widget: {
              path: `packages/widgets/src/${name}/`,
              export: `@repo/widgets/${name}`,
            },
          }
        : {}),

      ...(type === "agent"
        ? {
            agentServer: {
              // agent-server 파일은 실제 존재 여부를 확인하여 경로 설정
              // 존재하지 않는 경로는 undefined로 남김
              routes: existsSync(join(atlasPath, `apps/agent-server/src/routes/${name}.ts`))
                ? `apps/agent-server/src/routes/${name}.ts` : undefined,
              services: existsSync(join(atlasPath, `apps/agent-server/src/services/${name}.service.ts`))
                ? `apps/agent-server/src/services/${name}.service.ts` : undefined,
              tools: existsSync(join(atlasPath, `apps/agent-server/src/tools/${name}.tools.ts`))
                ? `apps/agent-server/src/tools/${name}.tools.ts` : undefined,
            },
          }
        : {}),
    };

    features[name] = entry;
  }

  return {
    version: "1.0.0",
    source: "BBrightcode-atlas/feature-atlas",
    features,
    core: CORE_FEATURES,
    groups: {
      core: { label: "코어", order: 0 },
      content: { label: "콘텐츠", order: 1 },
      commerce: { label: "상거래", order: 2 },
      community: { label: "커뮤니티", order: 3 },
      system: { label: "시스템", order: 4 },
      template: { label: "템플릿", order: 5 },
    },
  };
}
