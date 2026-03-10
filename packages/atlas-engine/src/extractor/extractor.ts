import { cpSync, existsSync, lstatSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import type { FeatureRegistry } from "../registry/types";
import type {
  ExtractorConfig,
  ExtractResult,
  SuperbuilderMetadata,
} from "./types";
import {
  generateSchemaIndex,
  generateDrizzleConfig,
  generateAppRouter,
  generateTrpcRouter,
  generateAppModule,
  generateClientRouter,
  generateAdminRouter,
  generateFeatureConfig,
} from "./generators";

/** 복사 시 제외할 디렉토리/파일 패턴 */
const EXCLUDE_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  ".turbo",
  ".cache",
  ".claude",
  ".agents",
  ".auto-claude",
  ".superset",
  ".playwright-cli",
  ".agent",
]);

/**
 * Feature Atlas에서 선택된 feature만 추출
 *
 * 1. 전체 프로젝트를 대상 디렉토리로 복사 (제외 디렉토리 빼고)
 * 2. 선택되지 않은 feature 디렉토리 제거
 * 3. Connection file 재생성
 * 4. superbuilder.json 메타데이터 생성
 */
export function extract(config: ExtractorConfig): ExtractResult {
  const { sourcePath, targetPath, registry, resolved } = config;
  const selectedFeatures = resolved.resolved;
  const selectedSet = new Set(selectedFeatures);

  // 모든 feature 이름
  const allFeatures = Object.keys(registry.features);
  const unselectedFeatures = allFeatures.filter((f) => !selectedSet.has(f));

  // Step 1: 전체 복사
  copyProject(sourcePath, targetPath);

  // Step 2: 선택되지 않은 feature 디렉토리 제거
  const removedDirs = removeUnselectedFeatures(
    targetPath,
    unselectedFeatures,
    registry,
  );

  // Step 3: Connection file 재생성
  const regeneratedFiles = regenerateConnectionFiles(
    targetPath,
    selectedFeatures,
    registry,
  );

  // Step 4: superbuilder.json 생성
  const metadataPath = writeSuperbuilderMetadata(
    sourcePath,
    targetPath,
    resolved.selected,
    selectedFeatures,
    registry,
  );

  return {
    targetPath,
    features: selectedFeatures,
    removedDirs,
    regeneratedFiles,
    metadataPath,
  };
}

/**
 * 프로젝트 전체를 대상 디렉토리로 복사
 * .git, node_modules 등은 제외
 */
function copyProject(sourcePath: string, targetPath: string): void {
  cpSync(sourcePath, targetPath, {
    recursive: true,
    filter: (src) => {
      const basename = src.split("/").pop() ?? "";
      if (EXCLUDE_DIRS.has(basename)) return false;

      // 깨진 심볼릭 링크 건너뛰기
      try {
        const stat = lstatSync(src);
        if (stat.isSymbolicLink()) {
          try {
            realpathSync(src);
          } catch {
            return false; // 대상이 없는 심볼릭 링크
          }
        }
      } catch {
        return false;
      }

      return true;
    },
  });
}

/**
 * 선택되지 않은 feature의 디렉토리 제거
 *
 * 제거 대상 경로:
 * - packages/features/{name}/
 * - packages/drizzle/src/schema/features/{schemaDir}/
 * - apps/app/src/features/{name}/
 * - apps/feature-admin/src/features/{name}/
 * - packages/widgets/src/{name}/ (widget인 경우)
 */
function removeUnselectedFeatures(
  targetPath: string,
  unselectedFeatures: string[],
  registry: FeatureRegistry,
): string[] {
  const removedDirs: string[] = [];

  for (const name of unselectedFeatures) {
    const entry = registry.features[name];
    if (!entry) continue;

    // Server feature 디렉토리
    const serverDir = join(targetPath, `packages/features/${name}`);
    if (existsSync(serverDir)) {
      rmSync(serverDir, { recursive: true, force: true });
      removedDirs.push(`packages/features/${name}`);
    }

    // Schema 디렉토리
    if (entry.schema.path) {
      const schemaDir = join(targetPath, entry.schema.path);
      if (existsSync(schemaDir)) {
        rmSync(schemaDir, { recursive: true, force: true });
        removedDirs.push(entry.schema.path);
      }
    }

    // Client app 디렉토리
    if (entry.client.app) {
      const appDir = join(targetPath, entry.client.app);
      if (existsSync(appDir)) {
        rmSync(appDir, { recursive: true, force: true });
        removedDirs.push(entry.client.app);
      }
    }

    // Client admin 디렉토리
    if (entry.client.admin) {
      const adminDir = join(targetPath, entry.client.admin);
      if (existsSync(adminDir)) {
        rmSync(adminDir, { recursive: true, force: true });
        removedDirs.push(entry.client.admin);
      }
    }

    // Widget 디렉토리
    if (entry.widget?.path) {
      const widgetDir = join(targetPath, entry.widget.path);
      if (existsSync(widgetDir)) {
        rmSync(widgetDir, { recursive: true, force: true });
        removedDirs.push(entry.widget.path);
      }
    }
  }

  return removedDirs;
}

/**
 * Connection file 재생성
 * 각 generator는 원본 파일을 읽고, 선택된 feature만 남기고 재작성
 */
function regenerateConnectionFiles(
  targetPath: string,
  selectedFeatures: string[],
  registry: FeatureRegistry,
): string[] {
  const regenerated: string[] = [];

  const generators = [
    { fn: generateSchemaIndex, label: "packages/drizzle/src/schema/index.ts" },
    { fn: generateDrizzleConfig, label: "packages/drizzle/drizzle.config.ts" },
    { fn: generateAppRouter, label: "packages/features/app-router.ts" },
    {
      fn: generateTrpcRouter,
      label: "apps/atlas-server/src/trpc/router.ts",
    },
    { fn: generateAppModule, label: "apps/atlas-server/src/app.module.ts" },
    { fn: generateClientRouter, label: "apps/app/src/router.tsx" },
    { fn: generateAdminRouter, label: "apps/feature-admin/src/router.tsx" },
    {
      fn: generateFeatureConfig,
      label: "apps/feature-admin/src/feature-config.ts",
    },
  ];

  for (const { fn, label } of generators) {
    try {
      fn(targetPath, selectedFeatures, registry);
      regenerated.push(label);
    } catch (err) {
      // Connection file이 없을 수 있음 (선택적)
      console.warn(
        `Warning: Failed to regenerate ${label}: ${(err as Error).message}`,
      );
    }
  }

  return regenerated;
}

/**
 * superbuilder.json 메타데이터 작성
 */
function writeSuperbuilderMetadata(
  sourcePath: string,
  targetPath: string,
  userSelected: string[],
  resolvedFeatures: string[],
  registry: FeatureRegistry,
): string {
  // 소스 버전 읽기
  let sourceVersion = "unknown";
  try {
    const pkgPath = join(sourcePath, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    sourceVersion = pkg.version ?? "unknown";
  } catch {
    // 무시
  }

  // 환경변수 수집
  const infraEnvs = new Set<string>();
  const featureEnvs = new Set<string>();

  for (const name of resolvedFeatures) {
    const entry = registry.features[name];
    if (entry?.env) {
      for (const e of entry.env.infrastructure ?? []) infraEnvs.add(e);
      for (const e of entry.env.feature ?? []) featureEnvs.add(e);
    }
  }

  const metadata: SuperbuilderMetadata = {
    source: registry.source,
    sourceVersion,
    createdAt: new Date().toISOString(),
    createdBy: "superbuilder",
    features: userSelected,
    resolvedFeatures,
    env: {
      infrastructure: [...infraEnvs],
      feature: [...featureEnvs],
    },
  };

  const metadataPath = join(targetPath, "superbuilder.json");
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  return metadataPath;
}
