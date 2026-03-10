import { z } from "zod";
import { join } from "node:path";
import { publicProcedure, router } from "../..";
import { extract, loadRegistry, resolveFeatures } from "@superbuilder/atlas-engine";
import { localDb } from "main/lib/local-db";
import { atlasProjects } from "@superset/local-db";
import simpleGit from "simple-git";

function getAtlasPath(): string {
	const envPath = process.env.ATLAS_PATH;
	if (!envPath) throw new Error("ATLAS_PATH not set");
	return envPath;
}

async function initGitForAtlas(projectPath: string): Promise<boolean> {
	try {
		const git = simpleGit(projectPath);
		try {
			await git.init(["--initial-branch=main"]);
		} catch {
			await git.init();
		}
		await git.add(".");
		await git.commit("Initial commit from Atlas Composer");
		return true;
	} catch (error) {
		console.warn("[atlas-composer] Git init failed:", error);
		return false;
	}
}

export const createAtlasComposerRouter = () =>
	router({
		compose: publicProcedure
			.input(
				z.object({
					selected: z.array(z.string()),
					projectName: z.string().min(1),
					targetPath: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const atlasPath = getAtlasPath();
				const registry = loadRegistry(atlasPath);
				const resolved = resolveFeatures(registry, input.selected);

				// targetPath(저장 경로) + projectName(프로젝트 이름) = 실제 프로젝트 디렉토리
				const projectPath = join(input.targetPath, input.projectName);

				// Step 1: Extract files
				const result = extract({
					sourcePath: atlasPath,
					targetPath: projectPath,
					registry,
					resolved,
				});

				// Step 2: Git init
				const gitInitialized = await initGitForAtlas(projectPath);

				// Step 3: Save to local-db
				const [project] = await localDb
					.insert(atlasProjects)
					.values({
						name: input.projectName,
						localPath: projectPath,
						features: resolved.all,
						gitInitialized,
						status: "created",
					})
					.returning();

				return {
					...result,
					projectName: input.projectName,
					projectId: project.id,
					gitInitialized,
				};
			}),
	});
