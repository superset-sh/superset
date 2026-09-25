import type { TRPCRouterRecord } from "@trpc/server";
import {
	disconnectGithubUser,
	GithubUserConnectionError,
	githubUserAuthorizeUrl,
	githubUserConnectionConfigured,
	githubUserConnectionFor,
} from "../../lib/github-user";
import { jwtProcedure, userError } from "../../trpc";

/** The caller's own GitHub connection: what it is, how to start one, how to end it. */
export const githubUserRouter = {
	get: jwtProcedure.query(async ({ ctx }) => {
		const connection = await githubUserConnectionFor(ctx.userId);
		return {
			available: githubUserConnectionConfigured(),
			connection: connection
				? { login: connection.login, name: connection.name }
				: null,
		};
	}),

	connect: jwtProcedure.mutation(({ ctx }) => {
		try {
			return { url: githubUserAuthorizeUrl(ctx.userId) };
		} catch (error) {
			if (!(error instanceof GithubUserConnectionError)) throw error;
			throw userError({
				code: "PRECONDITION_FAILED",
				message: error.message,
				i18nKey: "serverError.githubUser.notConfigured",
			});
		}
	}),

	disconnect: jwtProcedure.mutation(async ({ ctx }) => {
		await disconnectGithubUser(ctx.userId);
		return { disconnected: true };
	}),
} satisfies TRPCRouterRecord;
