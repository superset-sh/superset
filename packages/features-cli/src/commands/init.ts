import chalk from "chalk";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import { connectFeature } from "../utils/connector.js";
import { copyDirectory, copyFeature, isEmptyDirectory } from "../utils/files.js";
import { logger } from "../utils/logger.js";
import {
  type ProjectRegistry,
  getAtlasRoot,
  getAvailableFeatures,
  getFeatureSourcePath,
  saveProjectRegistry,
} from "../utils/registry.js";

interface InitOptions {
  template: "minimal" | "starter" | "full";
  features?: string;
}

const TEMPLATE_FEATURES: Record<string, string[]> = {
  minimal: [],
  starter: ["auth"],
  full: ["auth", "blog"],
};

export async function initCommand(projectName: string, options: InitOptions): Promise<void> {
  const projectPath = path.resolve(process.cwd(), projectName);

  logger.title(`Creating project: ${projectName}`);
  logger.info(`Template: ${options.template}`);

  // 1. 디렉토리 확인
  if (await fs.pathExists(projectPath)) {
    if (!(await isEmptyDirectory(projectPath))) {
      const { overwrite } = await inquirer.prompt([
        {
          type: "confirm",
          name: "overwrite",
          message: `Directory '${projectName}' is not empty. Continue anyway?`,
          default: false,
        },
      ]);

      if (!overwrite) {
        logger.info("Aborted");
        return;
      }
    }
  }

  // 2. 설치할 Feature 결정
  let featuresToInstall: string[] = [];

  if (options.features) {
    featuresToInstall = options.features.split(",").map((f) => f.trim());
  } else {
    featuresToInstall = TEMPLATE_FEATURES[options.template] || [];
  }

  logger.info(`Features: ${featuresToInstall.length > 0 ? featuresToInstall.join(", ") : "none"}`);
  logger.blank();

  const spinner = ora("Creating project structure...").start();

  try {
    // 3. 기본 구조 생성
    await fs.ensureDir(projectPath);

    // Atlas 루트에서 템플릿 복사
    const atlasRoot = getAtlasRoot();

    // apps 복사 (기본 슬롯 구조)
    await copyDirectory(path.join(atlasRoot, "apps"), path.join(projectPath, "apps"), [
      "node_modules",
      ".turbo",
      "dist",
    ]);

    // packages/core 복사
    await copyDirectory(
      path.join(atlasRoot, "packages", "core"),
      path.join(projectPath, "packages", "core"),
      ["node_modules", "dist"],
    );

    // packages/shared 복사
    await copyDirectory(
      path.join(atlasRoot, "packages", "shared"),
      path.join(projectPath, "packages", "shared"),
      ["node_modules", "dist"],
    );

    // packages/drizzle 복사
    await copyDirectory(
      path.join(atlasRoot, "packages", "drizzle"),
      path.join(projectPath, "packages", "drizzle"),
      ["node_modules", "dist"],
    );

    // packages/ui 복사
    await copyDirectory(
      path.join(atlasRoot, "packages", "ui"),
      path.join(projectPath, "packages", "ui"),
      ["node_modules", "dist"],
    );

    // packages/features 기본 구조 (빈 디렉토리 + package.json)
    await fs.ensureDir(path.join(projectPath, "packages", "features"));
    await fs.writeJson(
      path.join(projectPath, "packages", "features", "package.json"),
      {
        name: "@superbuilder/features",
        version: "0.0.0",
        private: true,
        exports: {},
      },
      { spaces: 2 },
    );

    // 설정 파일들 복사
    const configFiles = [
      "package.json",
      "pnpm-workspace.yaml",
      "turbo.json",
      "tsconfig.json",
      "drizzle.config.ts",
      ".env.example",
      ".gitignore",
    ];

    for (const file of configFiles) {
      const srcFile = path.join(atlasRoot, file);
      if (await fs.pathExists(srcFile)) {
        await fs.copy(srcFile, path.join(projectPath, file));
      }
    }

    // TypeScript 설정 복사
    if (await fs.pathExists(path.join(atlasRoot, "packages", "typescript-config"))) {
      await copyDirectory(
        path.join(atlasRoot, "packages", "typescript-config"),
        path.join(projectPath, "packages", "typescript-config"),
        ["node_modules"],
      );
    }

    // ESLint 설정 복사
    if (await fs.pathExists(path.join(atlasRoot, "packages", "eslint-config"))) {
      await copyDirectory(
        path.join(atlasRoot, "packages", "eslint-config"),
        path.join(projectPath, "packages", "eslint-config"),
        ["node_modules"],
      );
    }

    // package.json의 name 수정
    const pkgJsonPath = path.join(projectPath, "package.json");
    if (await fs.pathExists(pkgJsonPath)) {
      const pkgJson = await fs.readJson(pkgJsonPath);
      pkgJson.name = projectName;
      await fs.writeJson(pkgJsonPath, pkgJson, { spaces: 2 });
    }

    spinner.succeed("Created project structure");

    // 4. Registry 초기화
    const registry: ProjectRegistry = {
      installed: {},
      atlasVersion: "0.0.1",
      createdAt: new Date().toISOString(),
    };

    await fs.ensureDir(path.join(projectPath, "registry"));
    await saveProjectRegistry(projectPath, registry);

    // 5. Feature 설치
    if (featuresToInstall.length > 0) {
      const availableRegistry = await getAvailableFeatures();

      for (const featureName of featuresToInstall) {
        const featureSpinner = ora(`Installing ${featureName}...`).start();

        try {
          const spec = availableRegistry.features[featureName];

          if (!spec) {
            featureSpinner.warn(`Feature '${featureName}' not found, skipping`);
            continue;
          }

          const sourcePath = getFeatureSourcePath(featureName);
          const targetPath = path.join(projectPath, "packages", "features", featureName);

          // 파일 복사
          await copyFeature(sourcePath, targetPath);

          // 슬롯 연결
          await connectFeature(projectPath, featureName, spec);

          // Registry 업데이트
          registry.installed[featureName] = {
            version: spec.version,
            installedAt: new Date().toISOString(),
            modified: false,
          };

          featureSpinner.succeed(`Installed ${featureName}`);
        } catch (error) {
          featureSpinner.fail(`Failed to install ${featureName}`);
          logger.error(error instanceof Error ? error.message : String(error));
        }
      }

      // Registry 저장
      await saveProjectRegistry(projectPath, registry);
    }

    // 6. 완료 메시지
    logger.blank();
    logger.success("Project created successfully!");
    logger.blank();

    console.log(chalk.bold("Next steps:"));
    console.log(`  cd ${projectName}`);
    console.log("  cp .env.example .env");
    console.log("  pnpm install");
    console.log("  pnpm db:push");
    console.log("  pnpm dev");
    logger.blank();
  } catch (error) {
    spinner.fail("Failed to create project");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
