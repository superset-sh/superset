import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { FeatureRegistry } from "../../registry/types";

/**
 * apps/atlas-server/src/app.module.ts 재생성
 *
 * [ATLAS:IMPORTS] / [ATLAS:MODULES] 마커 사이의 feature import/module 등록을
 * 선택된 feature만 남기도록 필터링.
 *
 * 마커가 없으면 import 이름/Module 이름 기반으로 필터링.
 */
export function generateAppModule(
  targetPath: string,
  selectedFeatures: string[],
  registry: FeatureRegistry,
): string {
  const filePath = join(targetPath, "apps/atlas-server/src/app.module.ts");
  const original = readFileSync(filePath, "utf-8");

  const selectedSet = new Set(selectedFeatures);

  // Module 클래스명 → feature name 매핑 빌드
  // registry에서 module 파일 경로를 분석하여 Module 클래스명 추출
  // "packages/features/blog/blog.module.ts" → import 라인에서 { BlogModule } 추출
  // 접근 방식: import { XxxModule } from '@repo/features/yyy' 에서 yyy를 feature name으로 매핑

  // feature name → import path의 feature 부분 매핑
  const importPathToFeature = new Map<string, string>();
  for (const [name, entry] of Object.entries(registry.features)) {
    // router.from = "@repo/features/blog" → "blog"
    const fromMatch = entry.router.from.match(
      /@repo\/features\/(.+)/,
    );
    if (fromMatch) {
      importPathToFeature.set(fromMatch[1], name);
    }
  }

  const lines = original.split("\n");
  const result: string[] = [];

  let inImportsBlock = false;
  let inModulesBlock = false;

  for (const line of lines) {
    // 마커 감지
    if (line.includes("[ATLAS:IMPORTS]") && !line.includes("[/ATLAS:IMPORTS]")) {
      inImportsBlock = true;
      result.push(line);
      continue;
    }
    if (line.includes("[/ATLAS:IMPORTS]")) {
      inImportsBlock = false;
      result.push(line);
      continue;
    }
    if (line.includes("[ATLAS:MODULES]") && !line.includes("[/ATLAS:MODULES]")) {
      inModulesBlock = true;
      result.push(line);
      continue;
    }
    if (line.includes("[/ATLAS:MODULES]")) {
      inModulesBlock = false;
      result.push(line);
      continue;
    }

    if (inImportsBlock) {
      // import { XxxModule } from '@repo/features/yyy'
      const importMatch = line.match(
        /import\s+\{[^}]+\}\s+from\s+['"]@repo\/features\/([^'"]+)['"]/,
      );
      if (importMatch) {
        const featurePath = importMatch[1];
        const featureName = importPathToFeature.get(featurePath);
        if (featureName !== undefined) {
          if (selectedSet.has(featureName)) {
            result.push(line);
          }
          continue;
        }
      }
      // import 이외 라인(빈 줄 등)은 유지
      result.push(line);
      continue;
    }

    if (inModulesBlock) {
      // Module 이름 참조 라인 감지: "    XxxModule,"
      const moduleMatch = line.match(/^\s+(\w+Module)\s*,?\s*$/);
      if (moduleMatch) {
        const moduleName = moduleMatch[1];
        // Module 이름에서 feature 이름 추출 시도
        // 방법: 모든 feature의 import 라인에 있는 Module 이름과 비교
        let isSelected = false;
        let isFeatureModule = false;
        for (const [name, entry] of Object.entries(registry.features)) {
          // import path에서 Module이 해당 feature의 것인지 확인
          // Module 이름을 직접 비교하는 대신, feature name으로 추정
          // e.g. BlogModule → blog, ContentStudioModule → content-studio
          const fromMatch = entry.router.from.match(/@repo\/features\/(.+)/);
          if (fromMatch) {
            // feature path에서 예상 Module 이름 생성
            const expectedModuleName = toModuleName(fromMatch[1]);
            if (moduleName === expectedModuleName) {
              isFeatureModule = true;
              isSelected = selectedSet.has(name);
              break;
            }
          }
        }
        if (isFeatureModule) {
          if (isSelected) {
            result.push(line);
          }
          continue;
        }
      }
      // 비-Module 라인(주석, 빈 줄 등)은 유지
      result.push(line);
      continue;
    }

    // 마커 밖 라인은 항상 유지
    result.push(line);
  }

  const content = result.join("\n");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/**
 * feature path를 NestJS Module 클래스명으로 변환
 * "blog" → "BlogModule"
 * "hello-world" → "HelloWorldModule"
 * "content-studio" → "ContentStudioModule"
 * "ai" → "AIModule"
 * "ai-image" → "AiImageModule"
 */
function toModuleName(featurePath: string): string {
  // 특수 케이스 매핑
  const specialCases: Record<string, string> = {
    ai: "AIModule",
  };

  if (specialCases[featurePath]) {
    return specialCases[featurePath];
  }

  const pascal = featurePath
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  return `${pascal}Module`;
}
