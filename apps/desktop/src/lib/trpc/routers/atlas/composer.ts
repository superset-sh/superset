import { z } from "zod";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { publicProcedure, router } from "../..";
import { extract, loadRegistry, resolveFeatures } from "@superbuilder/atlas-engine";
import { localDb } from "main/lib/local-db";
import { atlasProjects } from "@superset/local-db";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";

const execFileAsync = promisify(execFile);

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

async function createGitHubRepo(
	name: string,
	projectPath: string,
	isPrivate: boolean,
): Promise<{ repoUrl: string; owner: string; repo: string }> {
	const visibility = isPrivate ? "--private" : "--public";

	// Organization repo로 생성 (BBrightcode-atlas)
	const orgName = "BBrightcode-atlas";
	const fullName = `${orgName}/${name}`;
	await execFileAsync("gh", ["repo", "create", fullName, visibility, "--source", projectPath, "--push"], {
		cwd: projectPath,
	});

	// Get repo info
	const { stdout } = await execFileAsync("gh", ["repo", "view", "--json", "url,owner,name"], {
		cwd: projectPath,
	});
	const info = JSON.parse(stdout);
	return {
		repoUrl: info.url,
		owner: info.owner.login,
		repo: info.name,
	};
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
						features: resolved.resolved,
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

		pushToGitHub: publicProcedure
			.input(
				z.object({
					projectPath: z.string().min(1),
					repoName: z.string().min(1),
					isPrivate: z.boolean().default(true),
					atlasProjectId: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const { repoUrl, owner, repo } = await createGitHubRepo(
					input.repoName,
					input.projectPath,
					input.isPrivate,
				);

				// Update local DB with GitHub info
				await localDb
					.update(atlasProjects)
					.set({
						gitRemoteUrl: repoUrl,
						updatedAt: Date.now(),
					})
					.where(eq(atlasProjects.id, input.atlasProjectId));

				return { repoUrl, owner, repo };
			}),
	});
