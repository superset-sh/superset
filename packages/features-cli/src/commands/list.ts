import chalk from "chalk";
import { isAtlasProject } from "../utils/files.js";
import { logger } from "../utils/logger.js";
import { getAvailableFeatures, getProjectRegistry } from "../utils/registry.js";

interface ListOptions {}

export async function listCommand(options: ListOptions): Promise<void> {
  const projectPath = process.cwd();

  logger.title("Feature Atlas - Available Features");

  // Atlas Registry에서 사용 가능한 Feature 목록
  const registry = await getAvailableFeatures();
  const features = Object.entries(registry.features);

  if (features.length === 0) {
    logger.warning("No features found in registry");
    return;
  }

  // 프로젝트 Registry (설치된 Feature 확인용)
  let installedFeatures: Set<string> = new Set();

  if (await isAtlasProject(projectPath)) {
    const projectRegistry = await getProjectRegistry(projectPath);
    if (projectRegistry) {
      installedFeatures = new Set(Object.keys(projectRegistry.installed));
    }
  }

  // 그룹별로 정리
  const groups = new Map<string, typeof features>();

  for (const [name, spec] of features) {
    const group = spec.group || "other";
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push([name, spec]);
  }

  // 출력
  for (const [groupName, groupFeatures] of groups) {
    console.log(chalk.bold.cyan(`  ${capitalize(groupName)}`));

    for (const [name, spec] of groupFeatures) {
      const installed = installedFeatures.has(name);
      const icon = installed ? chalk.green("✓") : chalk.gray("○");
      const nameStr = installed ? chalk.green(name) : chalk.white(name);
      const desc = chalk.gray(spec.description);

      console.log(`    ${icon} ${nameStr.padEnd(20)} ${desc}`);
    }

    console.log();
  }

  // 범례
  console.log(chalk.gray("  ✓ = installed, ○ = available"));
  console.log();
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
