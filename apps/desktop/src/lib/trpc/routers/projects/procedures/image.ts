import { exec } from "node:child_process";
import { promisify } from "node:util";
import { projects } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { secureFs } from "../../changes/security/secure-fs";

const execAsync = promisify(exec);

const MAX_IMAGE_SIZE_BYTES = 500 * 1024; // 500KB

/**
 * Image patterns with priority scores (lower = higher priority)
 */
const IMAGE_PRIORITY_PATTERNS: Array<{ pattern: RegExp; priority: number }> = [
	// Root favicon (highest priority)
	{ pattern: /^favicon\.(ico|png|svg)$/i, priority: 1 },
	// Root icon/logo
	{ pattern: /^(icon|logo)\.(png|svg|jpg|jpeg)$/i, priority: 2 },
	// .github directory
	{ pattern: /^\.github\/(logo|icon)\.(png|svg|jpg|jpeg)$/i, priority: 3 },
	// public directory
	{
		pattern: /^public\/(favicon|logo|icon)\.(ico|png|svg|jpg|jpeg)$/i,
		priority: 4,
	},
	// assets/images directory
	{
		pattern: /^(assets|images)\/(logo|icon|favicon)\.(ico|png|svg|jpg|jpeg)$/i,
		priority: 5,
	},
	// app directory (Next.js)
	{ pattern: /^(app|src\/app)\/(icon|favicon)\.(ico|png|svg)$/i, priority: 6 },
	// Any other image
	{ pattern: /\.(png|jpg|jpeg|ico|svg)$/i, priority: 100 },
];

/**
 * Get priority score for an image path (lower = higher priority)
 */
function getImagePriority(filePath: string): number {
	for (const { pattern, priority } of IMAGE_PRIORITY_PATTERNS) {
		if (pattern.test(filePath)) {
			return priority;
		}
	}
	return 999;
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
	const ext = filePath.toLowerCase().split(".").pop();
	switch (ext) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "ico":
			return "image/x-icon";
		case "svg":
			return "image/svg+xml";
		default:
			return "application/octet-stream";
	}
}

/**
 * Discover images in a repository using git ls-files
 */
async function discoverImagesInRepo(repoPath: string): Promise<string[]> {
	try {
		// Use git ls-files to get tracked image files
		const { stdout } = await execAsync(
			'git ls-files "*.png" "*.jpg" "*.jpeg" "*.ico" "*.svg"',
			{
				cwd: repoPath,
				maxBuffer: 1024 * 1024, // 1MB buffer
			},
		);

		const files = stdout
			.split("\n")
			.map((f) => f.trim())
			.filter((f) => f.length > 0);

		// Sort by priority
		return files.sort((a, b) => getImagePriority(a) - getImagePriority(b));
	} catch {
		// git command failed (not a git repo, or no images)
		return [];
	}
}

/**
 * Find the best auto-detected image for a project
 */
async function findAutoImage(repoPath: string): Promise<string | null> {
	const images = await discoverImagesInRepo(repoPath);

	// Return the highest priority image that exists and is under size limit
	for (const imagePath of images) {
		// Only consider high-priority images for auto-detection
		if (getImagePriority(imagePath) > 10) {
			break;
		}

		try {
			const stats = await secureFs.stat(repoPath, imagePath);
			if (stats.size <= MAX_IMAGE_SIZE_BYTES) {
				return imagePath;
			}
		} catch {
			// File not accessible, skip
		}
	}

	return null;
}

/**
 * Get a project by ID or throw NOT_FOUND error
 */
function getProjectOrThrow(projectId: string) {
	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();

	if (!project) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Project ${projectId} not found`,
		});
	}

	return project;
}

export const createProjectImageProcedures = () => {
	return router({
		/**
		 * Discover candidate images in a project repository
		 */
		discoverImages: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(async ({ input }) => {
				const project = getProjectOrThrow(input.projectId);

				const images = await discoverImagesInRepo(project.mainRepoPath);

				// Filter by size and add metadata
				const results: Array<{
					path: string;
					priority: number;
					size: number;
				}> = [];

				for (const imagePath of images) {
					try {
						const stats = await secureFs.stat(project.mainRepoPath, imagePath);
						if (stats.size <= MAX_IMAGE_SIZE_BYTES) {
							results.push({
								path: imagePath,
								priority: getImagePriority(imagePath),
								size: stats.size,
							});
						}
					} catch {
						// File not accessible, skip
					}
				}

				// Limit to top 50 images
				return results.slice(0, 50);
			}),

		/**
		 * Get the image data for a project thumbnail
		 */
		getProjectImage: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(async ({ input }) => {
				const project = getProjectOrThrow(input.projectId);

				// Check if project has a custom image set
				const imagePath = project.imagePath;

				// Empty string means use fallback icon
				if (imagePath === "") {
					return { type: "fallback" as const };
				}

				// null/undefined means auto-detect
				if (imagePath === null || imagePath === undefined) {
					const autoPath = await findAutoImage(project.mainRepoPath);
					if (!autoPath) {
						return { type: "fallback" as const };
					}

					try {
						const buffer = await secureFs.readFileBuffer(
							project.mainRepoPath,
							autoPath,
						);
						const mimeType = getMimeType(autoPath);
						const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
						return {
							type: "auto" as const,
							path: autoPath,
							dataUrl,
						};
					} catch {
						return { type: "fallback" as const };
					}
				}

				// Custom path specified
				try {
					const buffer = await secureFs.readFileBuffer(
						project.mainRepoPath,
						imagePath,
					);
					const mimeType = getMimeType(imagePath);
					const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
					return {
						type: "custom" as const,
						path: imagePath,
						dataUrl,
					};
				} catch {
					// Custom path no longer valid, fall back
					return { type: "fallback" as const };
				}
			}),

		/**
		 * Get image thumbnail data for a specific path (for picker preview)
		 */
		getImageThumbnail: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					imagePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const project = getProjectOrThrow(input.projectId);

				try {
					const buffer = await secureFs.readFileBuffer(
						project.mainRepoPath,
						input.imagePath,
					);
					const mimeType = getMimeType(input.imagePath);
					return {
						dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
					};
				} catch (_error) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Image not found or not accessible",
					});
				}
			}),

		/**
		 * Set the image path for a project
		 */
		setProjectImage: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					// null = auto-detect, "" = use fallback, string = specific path
					imagePath: z.string().nullable(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = getProjectOrThrow(input.projectId);

				// If setting a specific path, validate it exists
				if (input.imagePath && input.imagePath !== "") {
					try {
						const stats = await secureFs.stat(
							project.mainRepoPath,
							input.imagePath,
						);
						if (stats.size > MAX_IMAGE_SIZE_BYTES) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: `Image exceeds maximum size of ${MAX_IMAGE_SIZE_BYTES / 1024}KB`,
							});
						}
					} catch (error) {
						if (error instanceof TRPCError) throw error;
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Image not found or not accessible",
						});
					}
				}

				localDb
					.update(projects)
					.set({ imagePath: input.imagePath })
					.where(eq(projects.id, input.projectId))
					.run();

				return { success: true };
			}),
	});
};
