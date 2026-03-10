import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { FeatureRegistry } from "../../registry/types";

/**
 * apps/feature-admin/src/router.tsx 재생성
 *
 * 선택된 feature만의 admin route import + spread를 유지
 */
export function generateAdminRouter(
  targetPath: string,
  selectedFeatures: string[],
  registry: FeatureRegistry,
): string {
  const filePath = join(targetPath, "apps/feature-admin/src/router.tsx");
  const original = readFileSync(filePath, "utf-8");

  const selectedSet = new Set(selectedFeatures);

  // client.admin 경로가 있는 feature의 디렉토리 이름 수집
  const adminFeatureDirs = new Map<string, string>();
  for (const [name, entry] of Object.entries(registry.features)) {
    if (entry.client.admin) {
      const match = entry.client.admin.match(/features\/([^/]+)\/?$/);
      if (match) {
        adminFeatureDirs.set(match[1], name);
      }
    }
  }

  // client.app 경로도 수집 (admin에서 public route를 위해 등록하는 경우)
  const appFeatureDirs = new Map<string, string>();
  for (const [name, entry] of Object.entries(registry.features)) {
    if (entry.client.app) {
      const match = entry.client.app.match(/features\/([^/]+)\/?$/);
      if (match) {
        appFeatureDirs.set(match[1], name);
      }
    }
  }

  // 모든 feature dir → name 매핑 (admin과 app 합침)
  const allFeatureDirs = new Map<string, string>();
  for (const [dir, name] of adminFeatureDirs) allFeatureDirs.set(dir, name);
  for (const [dir, name] of appFeatureDirs) allFeatureDirs.set(dir, name);

  const lines = original.split("\n");
  const result: string[] = [];
  const removedImportNames = new Set<string>();

  for (const line of lines) {
    // Feature import 라인 감지
    const importMatch = line.match(
      /import\s+\{([^}]+)\}\s+from\s+["']\.\/features\/([^"']+)["']/,
    );
    if (importMatch) {
      const importedNames = importMatch[1].split(",").map((s) => s.trim());
      const featureDir = importMatch[2].replace(/\/.*$/, "");
      const featureName = allFeatureDirs.get(featureDir);

      if (featureName !== undefined) {
        if (selectedSet.has(featureName)) {
          result.push(line);
        } else {
          for (const n of importedNames) removedImportNames.add(n);
        }
        continue;
      }
    }

    // Spread 라인 감지
    const spreadMatch = line.match(/\.\.\.(create\w+)\(/);
    if (spreadMatch) {
      const funcName = spreadMatch[1];
      if (removedImportNames.has(funcName)) {
        continue;
      }
    }

    result.push(line);
  }

  const content = result.join("\n");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}
