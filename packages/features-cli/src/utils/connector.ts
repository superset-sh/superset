import fs from "fs-extra";
import path from "path";
import type { FeatureSpec } from "./registry.js";

/**
 * 마커 기반 파일 수정
 * [ATLAS:MARKER] ... [/ATLAS:MARKER] 사이에 내용 추가
 */
async function insertAtMarker(filePath: string, marker: string, content: string): Promise<boolean> {
  if (!(await fs.pathExists(filePath))) {
    return false;
  }

  const fileContent = await fs.readFile(filePath, "utf-8");
  const startMarker = `[ATLAS:${marker}]`;
  const endMarker = `[/ATLAS:${marker}]`;

  const startIndex = fileContent.indexOf(startMarker);
  const endIndex = fileContent.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    return false;
  }

  // 이미 추가되어 있는지 확인
  const existingContent = fileContent.slice(startIndex + startMarker.length, endIndex);
  if (existingContent.includes(content.trim())) {
    return true; // 이미 존재
  }

  // 마커 바로 다음 줄에 추가
  const beforeMarker = fileContent.slice(0, startIndex + startMarker.length);
  const afterMarker = fileContent.slice(startIndex + startMarker.length);

  const newContent = beforeMarker + "\n" + content + afterMarker;
  await fs.writeFile(filePath, newContent);

  return true;
}

/**
 * package.json exports에 Feature 추가
 */
export async function updatePackageExports(
  projectPath: string,
  featureName: string,
): Promise<void> {
  const packageJsonPath = path.join(projectPath, "packages", "features", "package.json");

  if (!(await fs.pathExists(packageJsonPath))) {
    throw new Error("packages/features/package.json not found");
  }

  const packageJson = await fs.readJson(packageJsonPath);

  if (!packageJson.exports) {
    packageJson.exports = {};
  }

  // 3-경로 패턴 추가
  packageJson.exports[`./${featureName}`] = `./${featureName}/index.ts`;
  packageJson.exports[`./${featureName}/server`] = `./${featureName}/server/index.ts`;
  packageJson.exports[`./${featureName}/types`] = `./${featureName}/types/index.ts`;

  await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
}

/**
 * Server app.module.ts에 Module import 추가
 */
export async function updateAppModule(
  projectPath: string,
  featureName: string,
  spec: FeatureSpec,
): Promise<boolean> {
  if (!spec.slots.server) {
    return true;
  }

  const appModulePath = path.join(projectPath, "apps", "atlas-server", "src", "app.module.ts");

  const moduleName = spec.slots.server.module;
  const importPath = spec.slots.server.path;

  // Import 추가
  const importLine = `import { ${moduleName} } from '${importPath}';`;
  await insertAtMarker(appModulePath, "IMPORTS", importLine);

  // Module 추가
  const moduleLine = `    ${moduleName},`;
  await insertAtMarker(appModulePath, "MODULES", moduleLine);

  return true;
}

/**
 * Client feature-routes.ts에 라우트 import 추가
 */
export async function updateFeatureRoutes(
  projectPath: string,
  featureName: string,
  spec: FeatureSpec,
): Promise<boolean> {
  if (!spec.slots.client) {
    return true;
  }

  const routesPath = path.join(projectPath, "apps", "web", "src", "feature-routes.ts");

  const routesName = spec.slots.client.routes;
  const importPath = spec.slots.client.path;

  // Import 추가
  const importLine = `import { ${routesName} } from '${importPath}';`;
  await insertAtMarker(routesPath, "IMPORTS", importLine);

  // Routes 추가
  const routeLine = `  ...${routesName},`;
  await insertAtMarker(routesPath, "ROUTES", routeLine);

  return true;
}

/**
 * drizzle.config.ts에 스키마 경로 추가
 */
export async function updateDrizzleConfig(
  projectPath: string,
  featureName: string,
  spec: FeatureSpec,
): Promise<boolean> {
  if (!spec.slots.schema) {
    return true;
  }

  const drizzleConfigPath = path.join(projectPath, "drizzle.config.ts");

  // Schema 경로 추가
  const schemaLine = `    './packages/features/${featureName}/server/schema/*.ts',`;
  await insertAtMarker(drizzleConfigPath, "SCHEMAS", schemaLine);

  // Tables filter 추가
  for (const table of spec.slots.schema.tables) {
    const tableLine = `    '${table}',`;
    await insertAtMarker(drizzleConfigPath, "TABLES", tableLine);
  }

  return true;
}

/**
 * Feature 연결 (모든 슬롯)
 */
export async function connectFeature(
  projectPath: string,
  featureName: string,
  spec: FeatureSpec,
): Promise<void> {
  await updatePackageExports(projectPath, featureName);
  await updateAppModule(projectPath, featureName, spec);
  await updateFeatureRoutes(projectPath, featureName, spec);
  await updateDrizzleConfig(projectPath, featureName, spec);
}

/**
 * Feature 연결 해제
 */
export async function disconnectFeature(projectPath: string, featureName: string): Promise<void> {
  // TODO: 마커 기반으로 해당 Feature 관련 라인 제거
  // 현재는 수동 제거 필요
}
