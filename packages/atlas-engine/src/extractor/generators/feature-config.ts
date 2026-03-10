import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { FeatureRegistry } from "../../registry/types";

/**
 * apps/feature-admin/src/feature-config.ts 재생성
 *
 * 선택된 feature만의 import + menu entry를 유지
 */
export function generateFeatureConfig(
  targetPath: string,
  selectedFeatures: string[],
  registry: FeatureRegistry,
): string {
  const filePath = join(
    targetPath,
    "apps/feature-admin/src/feature-config.ts",
  );
  const original = readFileSync(filePath, "utf-8");

  const selectedSet = new Set(selectedFeatures);

  // admin이 있는 feature의 디렉토리 이름 수집
  const adminFeatureDirs = new Map<string, string>();
  for (const [name, entry] of Object.entries(registry.features)) {
    if (entry.client.admin) {
      const match = entry.client.admin.match(/features\/([^/]+)\/?$/);
      if (match) {
        adminFeatureDirs.set(match[1], name);
      }
    }
  }

  const lines = original.split("\n");
  const result: string[] = [];

  // Phase 1: feature import 필터링 (./features/{dir} import만)
  const removedImportSymbols = new Set<string>();

  for (const line of lines) {
    // Feature path const import 감지: import { XXX } from "./features/{dir}"
    const importMatch = line.match(
      /import\s+\{([^}]+)\}\s+from\s+["']\.\/features\/([^"']+)["']/,
    );
    if (importMatch) {
      const symbols = importMatch[1].split(",").map((s) => s.trim());
      const featureDir = importMatch[2].replace(/\/.*$/, "");
      const featureName = adminFeatureDirs.get(featureDir);

      if (featureName !== undefined) {
        if (selectedSet.has(featureName)) {
          result.push(line);
        } else {
          for (const s of symbols) removedImportSymbols.add(s);
        }
        continue;
      }
    }

    result.push(line);
  }

  // Phase 2: menu entries 안에서 제거된 symbol을 참조하는 오브젝트 블록 제거
  // featureAdminMenus 배열에서 제거된 feature의 항목 제거
  if (removedImportSymbols.size > 0) {
    const filteredContent = filterMenuEntries(
      result.join("\n"),
      removedImportSymbols,
    );
    writeFileSync(filePath, filteredContent, "utf-8");
  } else {
    writeFileSync(filePath, result.join("\n"), "utf-8");
  }

  return filePath;
}

/**
 * featureAdminMenus 배열에서 제거된 path 상수를 참조하는 항목 제거
 *
 * 각 menu entry는 { ... } 블록. path: REMOVED_CONST를 포함하면 제거.
 */
function filterMenuEntries(
  content: string,
  removedSymbols: Set<string>,
): string {
  // 전략: featureAdminMenus 배열 내의 각 객체 리터럴을 식별하여
  // 제거된 symbol을 참조하는 항목을 제거

  const arrayStart = content.indexOf("featureAdminMenus: FeatureAdminMenu[] = [");
  if (arrayStart === -1) return content;

  const bracketStart = content.indexOf("[", arrayStart);
  let bracketDepth = 0;
  let bracketEnd = -1;

  for (let i = bracketStart; i < content.length; i++) {
    if (content[i] === "[") bracketDepth++;
    else if (content[i] === "]") {
      bracketDepth--;
      if (bracketDepth === 0) {
        bracketEnd = i + 1;
        break;
      }
    }
  }

  if (bracketEnd === -1) return content;

  const arrayContent = content.substring(bracketStart + 1, bracketEnd - 1);

  // 각 top-level 객체 리터럴을 추출
  const entries: { text: string; shouldKeep: boolean }[] = [];
  let depth = 0;
  let entryStart = -1;

  for (let i = 0; i < arrayContent.length; i++) {
    const ch = arrayContent[i];
    if (ch === "{" && depth === 0) {
      entryStart = i;
      depth++;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && entryStart !== -1) {
        const entryText = arrayContent.substring(entryStart, i + 1);
        // 이 entry가 제거된 symbol을 참조하는지 확인
        let shouldKeep = true;
        for (const sym of removedSymbols) {
          if (entryText.includes(sym)) {
            shouldKeep = false;
            break;
          }
        }
        entries.push({ text: entryText, shouldKeep });
        entryStart = -1;
      }
    }
  }

  const keptEntries = entries.filter((e) => e.shouldKeep);
  const newArrayContent = keptEntries
    .map((e) => e.text)
    .join(",\n");

  const newContent =
    content.substring(0, bracketStart + 1) +
    "\n" +
    newArrayContent +
    ",\n  // Feature 추가 시 여기에 등록\n" +
    content.substring(bracketEnd - 1);

  return newContent;
}
