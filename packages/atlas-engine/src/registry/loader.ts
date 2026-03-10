import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { FeatureRegistry } from "./types";

/**
 * Feature Atlas 레포에서 registry/features.json 로드
 */
export function loadRegistry(atlasPath: string): FeatureRegistry {
  const registryPath = join(atlasPath, "registry", "features.json");

  if (!existsSync(registryPath)) {
    throw new Error(
      `Registry not found at ${registryPath}. Run generate-cli.ts first.`,
    );
  }

  const content = readFileSync(registryPath, "utf-8");
  return JSON.parse(content) as FeatureRegistry;
}

/**
 * Registry 무결성 검증
 *
 * - 모든 dependency가 registry에 존재하는지 확인
 * - core features가 registry에 존재하는지 확인
 * - router key 중복 확인
 */
export function validateRegistry(registry: FeatureRegistry): string[] {
  const errors: string[] = [];
  const featureNames = new Set(Object.keys(registry.features));
  const routerKeys = new Set<string>();

  // Core features 존재 확인
  for (const core of registry.core) {
    if (!featureNames.has(core)) {
      errors.push(`Core feature "${core}" not found in registry`);
    }
  }

  for (const [name, feature] of Object.entries(registry.features)) {
    // Dependencies 존재 확인
    for (const dep of feature.dependencies) {
      if (!featureNames.has(dep)) {
        errors.push(
          `Feature "${name}" depends on "${dep}" which is not in registry`,
        );
      }
    }

    // Optional dependencies 존재 확인
    for (const dep of feature.optionalDependencies) {
      if (!featureNames.has(dep)) {
        errors.push(
          `Feature "${name}" has optional dependency "${dep}" which is not in registry`,
        );
      }
    }

    // Router key 중복 확인
    if (routerKeys.has(feature.router.key)) {
      errors.push(`Duplicate router key "${feature.router.key}" in feature "${name}"`);
    }
    routerKeys.add(feature.router.key);
  }

  return errors;
}
