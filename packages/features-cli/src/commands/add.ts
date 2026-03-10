import chalk from "chalk";
import ora from "ora";
import { connectFeature } from "../utils/connector.js";
import { copyFeature, isAtlasProject } from "../utils/files.js";
import { logger } from "../utils/logger.js";
import {
  type ProjectRegistry,
  getAvailableFeatures,
  getFeatureSourcePath,
  getFeatureTargetPath,
  getProjectRegistry,
  isFeatureInstalled,
  saveProjectRegistry,
} from "../utils/registry.js";

export async function addCommand(features: string[]): Promise<void> {
  const projectPath = process.cwd();

  logger.title(`Adding features: ${features.join(", ")}`);

  // 1. Atlas 프로젝트인지 확인
  if (!(await isAtlasProject(projectPath))) {
    logger.error("Not an Atlas project. Run 'atlas init' first.");
    process.exit(1);
  }

  // 2. Registry 로드
  const availableRegistry = await getAvailableFeatures();
  let projectRegistry = await getProjectRegistry(projectPath);

  if (!projectRegistry) {
    projectRegistry = {
      installed: {},
      atlasVersion: "0.0.1",
      createdAt: new Date().toISOString(),
    };
  }

  // 3. Feature 유효성 검사
  const invalidFeatures = features.filter((f) => !availableRegistry.features[f]);

  if (invalidFeatures.length > 0) {
    logger.error(`Features not found: ${invalidFeatures.join(", ")}`);
    logger.info("Run 'atlas list' to see available features");
    process.exit(1);
  }

  // 4. 이미 설치된 Feature 확인
  const alreadyInstalled = features.filter((f) => projectRegistry!.installed[f]);

  if (alreadyInstalled.length > 0) {
    logger.warning(`Already installed: ${alreadyInstalled.join(", ")}`);
  }

  // 5. 설치할 Feature 필터링
  const toInstall = features.filter((f) => !projectRegistry!.installed[f]);

  if (toInstall.length === 0) {
    logger.info("No new features to install");
    return;
  }

  // 6. 의존성 확인
  const missingDeps: string[] = [];
  for (const featureName of toInstall) {
    const spec = availableRegistry.features[featureName]!;
    for (const dep of spec.dependencies) {
      if (!projectRegistry.installed[dep] && !toInstall.includes(dep)) {
        missingDeps.push(`${featureName} requires ${dep}`);
      }
    }
  }

  if (missingDeps.length > 0) {
    logger.error("Missing dependencies:");
    missingDeps.forEach((msg) => logger.error(`  - ${msg}`));
    logger.info("Add required features first or include them in the command");
    process.exit(1);
  }

  // 7. Feature 설치
  for (const featureName of toInstall) {
    const spinner = ora(`Installing ${featureName}...`).start();

    try {
      const spec = availableRegistry.features[featureName]!;
      const sourcePath = getFeatureSourcePath(featureName);
      const targetPath = getFeatureTargetPath(projectPath, featureName);

      // 파일 복사
      await copyFeature(sourcePath, targetPath);
      spinner.text = `Connecting ${featureName}...`;

      // 슬롯 연결
      await connectFeature(projectPath, featureName, spec);

      // Registry 업데이트
      projectRegistry.installed[featureName] = {
        version: spec.version,
        installedAt: new Date().toISOString(),
        modified: false,
      };

      spinner.succeed(`Installed ${featureName}`);
    } catch (error) {
      spinner.fail(`Failed to install ${featureName}`);
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  // 8. Registry 저장
  await saveProjectRegistry(projectPath, projectRegistry);

  // 9. 완료 메시지
  logger.blank();
  logger.success("Features installed successfully!");
  logger.blank();

  console.log(chalk.bold("Next steps:"));
  console.log("  pnpm install    # Install dependencies");
  console.log("  pnpm db:push    # Apply schema changes");
  console.log("  pnpm dev        # Start development server");
  logger.blank();

  // 추가된 라우트 표시
  console.log(chalk.bold("Routes added:"));
  for (const featureName of toInstall) {
    const spec = availableRegistry.features[featureName]!;
    if (spec.slots.client) {
      console.log(`  /${featureName}           (public)`);
      console.log(`  /admin/${featureName}     (admin)`);
    }
  }
  logger.blank();
}
