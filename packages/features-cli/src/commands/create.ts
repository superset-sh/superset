import chalk from "chalk";
import inquirer from "inquirer";
import fs from "fs-extra";
import path from "path";
import ora from "ora";
import { isAtlasProject } from "../utils/files.js";
import { copyTemplate } from "../utils/files.js";
import { updatePackageExports } from "../utils/connector.js";

interface CreateOptions {
  featureName: string;
  featureType: "page" | "widget";
  entityName: string;
  PascalName: string;
  camelName: string;
  kebabName: string;
}

function toPascalCase(str: string): string {
  return str
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export async function createCommand(featureName: string) {
  const projectPath = process.cwd();

  if (!(await isAtlasProject(projectPath))) {
    console.error(chalk.red("Error: Not an Atlas project. Run this from the project root."));
    process.exit(1);
  }

  const serverPath = path.join(projectPath, "packages", "features", featureName);
  const clientPath = path.join(projectPath, "apps", "app", "src", "features", featureName);
  const schemaPath = path.join(
    projectPath,
    "packages",
    "drizzle",
    "src",
    "schema",
    "features",
    featureName,
  );

  if (await fs.pathExists(serverPath)) {
    console.error(chalk.red(`Error: Feature "${featureName}" already exists at ${serverPath}`));
    process.exit(1);
  }

  const { featureType, entityName } = await inquirer.prompt([
    {
      type: "list",
      name: "featureType",
      message: "Feature 유형:",
      choices: [
        { name: "Page Feature (독립 페이지, 라우트 있음)", value: "page" },
        { name: "Widget Feature (다른 Feature에 임베드, 라우트 없음)", value: "widget" },
      ],
    },
    {
      type: "input",
      name: "entityName",
      message: "메인 엔티티명 (예: post, product, order):",
      default: featureName,
      validate: (input: string) =>
        /^[a-z][a-z0-9-]*$/.test(input) || "kebab-case로 입력하세요 (예: blog-post)",
    },
  ]);

  const options: CreateOptions = {
    featureName,
    featureType,
    entityName,
    PascalName: toPascalCase(featureName),
    camelName: toCamelCase(featureName),
    kebabName: featureName,
  };

  const PascalEntity = toPascalCase(entityName);
  const camelEntity = toCamelCase(entityName);

  const variables: Record<string, string> = {
    featureName: options.kebabName,
    PascalName: options.PascalName,
    camelName: options.camelName,
    entityName,
    PascalEntity,
    camelEntity,
    featurePrefix: options.kebabName.replace(/-/g, "_"),
    entityTable: `${options.kebabName.replace(/-/g, "_")}_${entityName.replace(/-/g, "_")}s`,
  };

  const spinner = ora("Feature 생성 중...").start();

  try {
    // 1. Server Feature
    spinner.text = "Server Feature 생성 중...";
    const templatePath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "templates",
      "feature",
    );
    await copyTemplate(templatePath, serverPath, variables);

    // 2. Schema
    spinner.text = "Schema 생성 중...";
    await fs.ensureDir(schemaPath);
    const schemaContent = generateSchema(variables);
    await fs.writeFile(path.join(schemaPath, "index.ts"), schemaContent);

    // 3. Client Feature
    spinner.text = "Client Feature 생성 중...";
    await fs.ensureDir(path.join(clientPath, "hooks"));
    await fs.ensureDir(path.join(clientPath, "ui", "public"));
    await fs.ensureDir(path.join(clientPath, "types"));

    await fs.writeFile(path.join(clientPath, "index.ts"), generateClientIndex(variables));
    await fs.writeFile(
      path.join(clientPath, "hooks", `use-${entityName}s.ts`),
      generateClientHooks(variables),
    );
    await fs.writeFile(
      path.join(clientPath, "types", "index.ts"),
      `export type { ${PascalEntity} } from "@superbuilder/features/${options.kebabName}/types";\n`,
    );

    if (options.featureType === "page") {
      await fs.ensureDir(path.join(clientPath, "routes"));
      await fs.writeFile(
        path.join(clientPath, "ui", "public", `${entityName}-list.tsx`),
        generateClientPage(variables),
      );
    }

    // 4. Update package.json exports
    spinner.text = "package.json exports 업데이트 중...";
    await updatePackageExports(projectPath, options.kebabName);

    spinner.succeed(chalk.green(`Feature "${featureName}" 생성 완료!`));

    console.log();
    console.log(chalk.cyan("생성된 파일:"));
    console.log(chalk.gray(`  Server:  packages/features/${featureName}/`));
    console.log(chalk.gray(`  Client:  apps/app/src/features/${featureName}/`));
    console.log(chalk.gray(`  Schema:  packages/drizzle/src/schema/features/${featureName}/`));
    console.log();
    console.log(chalk.yellow("다음 단계:"));
    console.log(chalk.gray("  1. Schema 수정: packages/drizzle/src/schema/features/" + featureName + "/index.ts"));
    console.log(chalk.gray("  2. Schema re-export 추가: packages/drizzle/src/schema/index.ts"));
    console.log(chalk.gray("  3. AppModule 등록: apps/atlas-server/src/app.module.ts"));
    console.log(chalk.gray("  4. tRPC Router 등록: packages/features/app-router.ts + apps/atlas-server/src/trpc/router.ts"));
    console.log(chalk.gray("  5. pnpm db:push && pnpm build"));
  } catch (error) {
    spinner.fail(chalk.red("Feature 생성 실패"));
    console.error(error);
    process.exit(1);
  }
}

function generateSchema(vars: Record<string, string>): string {
  return `import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../utils";
import { profiles } from "../../core/profiles";

export const ${vars.camelEntity}s = pgTable("${vars.entityTable}", {
  ...baseColumns(),
  title: text("title").notNull(),
  content: text("content"),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
});

export type ${vars.PascalEntity} = typeof ${vars.camelEntity}s.$inferSelect;
export type New${vars.PascalEntity} = typeof ${vars.camelEntity}s.$inferInsert;
`;
}

function generateClientIndex(vars: Record<string, string>): string {
  return `export { use${vars.PascalEntity}s } from "./hooks/use-${vars.entityName}s";
`;
}

function generateClientHooks(vars: Record<string, string>): string {
  return `import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function use${vars.PascalEntity}s(page = 1, limit = 10) {
  const trpc = useTRPC();
  return useQuery(
    trpc.${vars.camelName}.list.queryOptions({ page, limit }),
  );
}
`;
}

function generateClientPage(vars: Record<string, string>): string {
  return `import { Feature, FeatureHeader, FeatureContents } from "@superbuilder/feature-ui";
import { use${vars.PascalEntity}s } from "../../hooks/use-${vars.entityName}s";

interface Props {}

export function ${vars.PascalEntity}ListPage({}: Props) {
  const { data, isLoading } = use${vars.PascalEntity}s();

  if (isLoading) return <div>Loading...</div>;

  return (
    <Feature>
      <FeatureHeader title="${vars.PascalName}" />
      <FeatureContents>
        <ul>
          {data?.map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      </FeatureContents>
    </Feature>
  );
}
`;
}
