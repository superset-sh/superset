import fs from "fs-extra";
import { glob } from "glob";
import path from "path";

/**
 * 디렉토리 복사 (특정 파일/폴더 제외)
 */
export async function copyDirectory(
  src: string,
  dest: string,
  exclude: string[] = [],
): Promise<void> {
  const defaultExclude = ["node_modules", ".git", "dist", ".turbo"];
  const allExclude = [...defaultExclude, ...exclude];

  await fs.copy(src, dest, {
    filter: (srcPath) => {
      const relativePath = path.relative(src, srcPath);
      return !allExclude.some(
        (pattern) => relativePath === pattern || relativePath.startsWith(pattern + "/"),
      );
    },
  });
}

/**
 * Feature 파일 복사
 */
export async function copyFeature(sourcePath: string, targetPath: string): Promise<void> {
  if (!(await fs.pathExists(sourcePath))) {
    throw new Error(`Feature source not found: ${sourcePath}`);
  }

  await copyDirectory(sourcePath, targetPath);
}

/**
 * 템플릿 파일 복사 및 변수 치환
 */
export async function copyTemplate(
  templatePath: string,
  targetPath: string,
  variables: Record<string, string>,
): Promise<void> {
  await fs.ensureDir(targetPath);

  const files = await glob("**/*", {
    cwd: templatePath,
    nodir: true,
    dot: true,
  });

  for (const file of files) {
    const srcFile = path.join(templatePath, file);
    let destFile = path.join(targetPath, file);

    // 파일명 변수 치환 (예: __projectName__ → my-project)
    for (const [key, value] of Object.entries(variables)) {
      destFile = destFile.replace(new RegExp(`__${key}__`, "g"), value);
    }

    // 파일 복사
    await fs.ensureDir(path.dirname(destFile));

    // 텍스트 파일인 경우 내용 변수 치환
    const content = await fs.readFile(srcFile, "utf-8");
    let newContent = content;

    for (const [key, value] of Object.entries(variables)) {
      newContent = newContent.replace(new RegExp(`{{${key}}}`, "g"), value);
    }

    await fs.writeFile(destFile, newContent);
  }
}

/**
 * Atlas 프로젝트인지 확인
 */
export async function isAtlasProject(projectPath: string): Promise<boolean> {
  const registryPath = path.join(projectPath, "registry", "features.json");
  const featuresPath = path.join(projectPath, "packages", "features");

  return (await fs.pathExists(registryPath)) || (await fs.pathExists(featuresPath));
}

/**
 * 디렉토리가 비어있는지 확인
 */
export async function isEmptyDirectory(dirPath: string): Promise<boolean> {
  if (!(await fs.pathExists(dirPath))) {
    return true;
  }

  const files = await fs.readdir(dirPath);
  return files.length === 0;
}
