import chalk from "chalk";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";
import { isAtlasProject } from "../utils/files.js";
import { logger } from "../utils/logger.js";
import {
  getAvailableFeatures,
  getFeatureTargetPath,
  getProjectRegistry,
  saveProjectRegistry,
} from "../utils/registry.js";

export async function removeCommand(featureName: string): Promise<void> {
  const projectPath = process.cwd();

  logger.title(`Removing feature: ${featureName}`);

  // 1. Atlas 프로젝트인지 확인
  if (!(await isAtlasProject(projectPath))) {
    logger.error("Not an Atlas project");
    process.exit(1);
  }

  // 2. Registry 로드
  const projectRegistry = await getProjectRegistry(projectPath);

  if (!projectRegistry) {
    logger.error("Project registry not found");
    process.exit(1);
  }

  // 3. 설치된 Feature인지 확인
  if (!projectRegistry.installed[featureName]) {
    logger.error(`Feature '${featureName}' is not installed`);
    process.exit(1);
  }

  // 4. 의존성 확인 (다른 Feature가 이 Feature에 의존하는지)
  const availableRegistry = await getAvailableFeatures();
  const dependentFeatures: string[] = [];

  for (const [name, installed] of Object.entries(projectRegistry.installed)) {
    if (name === featureName) continue;
    const spec = availableRegistry.features[name];
    if (spec?.dependencies.includes(featureName)) {
      dependentFeatures.push(name);
    }
  }

  if (dependentFeatures.length > 0) {
    logger.error(`Cannot remove '${featureName}'. Other features depend on it:`);
    dependentFeatures.forEach((f) => logger.error(`  - ${f}`));
    process.exit(1);
  }

  // 5. 삭제 확인
  const featurePath = getFeatureTargetPath(projectPath, featureName);
  const spec = availableRegistry.features[featureName];

  console.log(chalk.yellow("\nThis will delete:"));
  console.log(`  - ${featurePath}`);

  if (spec?.slots.schema?.tables) {
    console.log(`  - Database tables: ${spec.slots.schema.tables.join(", ")}`);
  }

  console.log();

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Remove feature '${featureName}'?`,
      default: false,
    },
  ]);

  if (!confirm) {
    logger.info("Aborted");
    return;
  }

  // 6. Feature 제거
  const spinner = ora(`Removing ${featureName}...`).start();

  try {
    // 파일 삭제
    await fs.remove(featurePath);

    // Registry에서 제거
    delete projectRegistry.installed[featureName];
    await saveProjectRegistry(projectPath, projectRegistry);

    spinner.succeed(`Removed ${featureName}`);
  } catch (error) {
    spinner.fail(`Failed to remove ${featureName}`);
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // 7. 수동 정리 안내
  logger.blank();
  logger.warning("Manual cleanup required:");
  console.log("  1. Remove import from apps/atlas-server/src/app.module.ts");
  console.log("  2. Remove import from apps/app/src/feature-routes.ts");
  console.log("  3. Remove exports from packages/features/package.json");
  console.log("  4. Remove schema path from drizzle.config.ts");
  console.log("  5. Run 'pnpm db:push' to update database (tables NOT auto-deleted)");
  logger.blank();
}
