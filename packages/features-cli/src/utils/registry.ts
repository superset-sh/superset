import fs from "fs-extra";
import path from "path";

export interface FeatureSpec {
  name: string;
  version: string;
  icon: string;
  description: string;
  group: string;
  dependencies: string[];
  slots: {
    server?: {
      module: string;
      path: string;
    };
    client?: {
      routes: string;
      path: string;
    };
    schema?: {
      tables: string[];
    };
  };
}

export interface Registry {
  features: Record<string, FeatureSpec>;
}

export interface ProjectRegistry {
  installed: Record<
    string,
    {
      version: string;
      installedAt: string;
      modified: boolean;
      modifiedFiles?: string[];
    }
  >;
  atlasVersion: string;
  createdAt: string;
}

/**
 * Atlas Registry 경로 찾기 (CLI가 설치된 위치 기준)
 */
export function getAtlasRoot(): string {
  // 개발 중에는 현재 프로젝트 루트
  // TODO: 배포 시에는 npm 글로벌 또는 원격 레지스트리
  return process.env.ATLAS_ROOT || path.resolve(process.cwd());
}

/**
 * Atlas Registry에서 Feature 목록 가져오기
 */
export async function getAvailableFeatures(): Promise<Registry> {
  const atlasRoot = getAtlasRoot();
  const registryPath = path.join(atlasRoot, "registry", "features.json");

  if (!(await fs.pathExists(registryPath))) {
    return { features: {} };
  }

  return fs.readJson(registryPath);
}

/**
 * 프로젝트 Registry 가져오기
 */
export async function getProjectRegistry(projectPath: string): Promise<ProjectRegistry | null> {
  const registryPath = path.join(projectPath, "registry", "features.json");

  if (!(await fs.pathExists(registryPath))) {
    return null;
  }

  return fs.readJson(registryPath);
}

/**
 * 프로젝트 Registry 저장
 */
export async function saveProjectRegistry(
  projectPath: string,
  registry: ProjectRegistry,
): Promise<void> {
  const registryPath = path.join(projectPath, "registry", "features.json");
  await fs.ensureDir(path.dirname(registryPath));
  await fs.writeJson(registryPath, registry, { spaces: 2 });
}

/**
 * Feature가 설치되었는지 확인
 */
export async function isFeatureInstalled(
  projectPath: string,
  featureName: string,
): Promise<boolean> {
  const registry = await getProjectRegistry(projectPath);
  return registry?.installed[featureName] !== undefined;
}

/**
 * Feature 소스 경로 가져오기
 */
export function getFeatureSourcePath(featureName: string): string {
  const atlasRoot = getAtlasRoot();
  return path.join(atlasRoot, "packages", "features", featureName);
}

/**
 * Feature 대상 경로 가져오기
 */
export function getFeatureTargetPath(projectPath: string, featureName: string): string {
  return path.join(projectPath, "packages", "features", featureName);
}
