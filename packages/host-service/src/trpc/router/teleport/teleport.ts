import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import {
	bundleHandoff,
	captureHandoff,
	checkDestination,
	createGitRunner,
	discardCapture,
	handoffRef,
	readDestinationBranch,
	restoreHandoff,
	summarizeWorkingTree,
} from "../../../teleport";
import { protectedProcedure, queryProcedure, router } from "../../index";
import { resolveWorktreePath } from "../git/utils/resolve-worktree";

/**
 * The host-side half of a teleport. Each procedure is one step the client
 * drives, in the order the review dialog names them, because both hosts have
 * to be addressed and only the client can reach both.
 *
 * Nothing here decides *whether* to move: the client shows the plan, the user
 * agrees, and then these run. The only refusals that happen inside are the
 * ones that can only be known at the moment of acting.
 */

const workspaceInput = z.object({ workspaceId: z.string() });

/** Bundles live here in both checkouts, under the ignored `.superset` dir. */
const BUNDLE_DIR = join(".superset", "teleport");

export const teleportRouter = router({
	/**
	 * What the source would send. Read-only: safe to call as the dialog opens,
	 * and safe to call again when the user changes destination.
	 */
	sourceState: queryProcedure
		.input(workspaceInput)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			const workingTree = await summarizeWorkingTree(worktreePath);
			return {
				branch: workspace?.branch ?? null,
				worktreePath,
				workingTree,
			};
		}),

	/**
	 * What the destination already has: whether it holds the branch, whether
	 * something has it checked out, and the tips it can offer as bundle
	 * prerequisites. Called against the *destination* host.
	 */
	destinationState: queryProcedure
		.input(z.object({ repositoryPath: z.string(), branch: z.string() }))
		.query(({ input }) =>
			readDestinationBranch(input.repositoryPath, input.branch),
		),

	/**
	 * Whether the source can hand this branch over at all. Split from
	 * `destinationState` because the answer needs both hosts, and only the
	 * source can say whether it contains the destination's tip.
	 */
	checkDestination: queryProcedure
		.input(
			workspaceInput.extend({
				branch: z.string(),
				destination: z.object({
					tip: z.string().nullable(),
					checkedOutAt: z.string().nullable(),
					tips: z.array(z.string()),
				}),
			}),
		)
		.query(async ({ ctx, input }) =>
			checkDestination({
				sourceWorktreePath: resolveWorktreePath(ctx, input.workspaceId),
				branch: input.branch,
				destination: input.destination,
			}),
		),

	/**
	 * Freeze the dirty state into commits and pack it for the destination.
	 * Leaves the checkout untouched, so a failure downstream costs nothing
	 * but the objects, which gc reclaims.
	 */
	capture: protectedProcedure
		// A large working tree takes real time to hash; the default timeout
		// would abandon a capture that was going to succeed.
		.meta({ timeoutMs: 300_000 })
		.input(
			workspaceInput.extend({
				/** Prerequisites from `destinationState`. */
				destinationTips: z.array(z.string()).default([]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const ref = handoffRef(input.workspaceId);
			// Inside the worktree on purpose: `filesystem.readFile` is scoped
			// to a workspace, and it is how the bundle reaches the other host.
			// `.superset/` is conventionally ignored, so the file cannot end up
			// in a later capture of this same checkout.
			const relativePath = join(BUNDLE_DIR, `${input.workspaceId}.bundle`);
			const bundlePath = join(worktreePath, relativePath);

			const capture = await captureHandoff({ worktreePath, ref });
			try {
				await mkdir(dirname(bundlePath), { recursive: true });
				await bundleHandoff({
					worktreePath,
					ref,
					destinationTips: input.destinationTips,
					outputPath: bundlePath,
				});
			} catch (error) {
				// A half-written bundle is worse than none: the ref would sit
				// there implying a capture the destination can never fetch.
				await discardCapture(worktreePath, ref);
				await rm(bundlePath, { force: true });
				throw error;
			}
			return { ...capture, bundlePath, relativePath };
		}),

	/**
	 * Capture and push the ref to origin, for a destination that cannot be
	 * handed a file: a cloud sandbox, which clones origin and runs a released
	 * host-service. Nothing ignored travels this way — origin may be a public
	 * forge — so the precious allowlist is off, and a pushed ref is bytes the
	 * destination fetches with plain git.
	 */
	publish: protectedProcedure
		.meta({ timeoutMs: 300_000 })
		.input(
			workspaceInput.extend({
				remote: z.string().default("origin"),
				/**
				 * A working tree id from an earlier publish. When the checkout
				 * still has that exact content, nothing is pushed and the
				 * answer says so: the second pass of a move, after the box is
				 * up, costs a capture and no transfer.
				 */
				unlessWorkingTree: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const ref = handoffRef(input.workspaceId);
			const capture = await captureHandoff({
				worktreePath,
				ref,
				preciousPathspecs: [],
			});
			if (
				input.unlessWorkingTree !== undefined &&
				capture.workingTree === input.unlessWorkingTree
			) {
				return {
					ref,
					head: capture.head,
					working: capture.working,
					workingTree: capture.workingTree,
					unchanged: true,
				};
			}
			try {
				await createGitRunner(worktreePath).run([
					"push",
					"-q",
					"--force",
					input.remote,
					`${ref}:${ref}`,
				]);
			} catch (error) {
				await discardCapture(worktreePath, ref);
				throw new TRPCError({
					code: "BAD_GATEWAY",
					message: `Could not push the teleport ref to ${input.remote}`,
					cause: error,
				});
			}
			return {
				ref,
				head: capture.head,
				working: capture.working,
				workingTree: capture.workingTree,
				unchanged: false,
			};
		}),

	/** Where a delivered bundle should be written on the destination. */
	bundleTarget: queryProcedure.input(workspaceInput).query(({ ctx, input }) => {
		const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
		const relativePath = join(BUNDLE_DIR, `${input.workspaceId}.bundle`);
		return { bundlePath: join(worktreePath, relativePath), relativePath };
	}),

	/**
	 * Fetch a delivered bundle into the destination checkout and put the work
	 * back. Called against the *destination* host.
	 */
	restore: protectedProcedure
		.meta({ timeoutMs: 300_000 })
		.input(
			workspaceInput.extend({
				bundlePath: z.string(),
				ref: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = createGitRunner(worktreePath);
			try {
				await git.run([
					"fetch",
					"-q",
					input.bundlePath,
					`${input.ref}:${input.ref}`,
				]);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "The teleport bundle could not be read",
					cause: error,
				});
			}
			await restoreHandoff({ worktreePath, ref: input.ref });
			return { restored: true as const };
		}),

	/** Drop a capture's ref after a successful transfer, or after a cancel. */
	discard: protectedProcedure
		.input(workspaceInput)
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			await discardCapture(worktreePath, handoffRef(input.workspaceId));
			// The bundle is a transfer artefact; leaving it behind would show
			// up as an untracked file in the user's next `git status`.
			await rm(join(worktreePath, BUNDLE_DIR), {
				recursive: true,
				force: true,
			});
			return { discarded: true as const };
		}),
});
