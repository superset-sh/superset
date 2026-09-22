import {
	completeGithubUserConnection,
	GithubUserConnectionError,
} from "@superset/trpc/lib/github-user";

/**
 * Where GitHub returns a person after they authorize the App for themselves.
 * The flow starts in the desktop, which opens GitHub in the browser, so this
 * page's only job is to say it worked and send them back.
 */
export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	if (url.searchParams.get("error")) {
		return page("GitHub was not connected", "You cancelled on GitHub.", 400);
	}
	if (!code || !state) {
		return page("GitHub was not connected", "The link was incomplete.", 400);
	}
	try {
		const { login } = await completeGithubUserConnection({ code, state });
		return page(
			`Connected as @${login}`,
			"Your cloud workspaces now commit, push and open pull requests as you. You can close this tab and return to Superset.",
			200,
		);
	} catch (error) {
		if (error instanceof GithubUserConnectionError) {
			return page("GitHub was not connected", error.message, 400);
		}
		console.error("[github/user/callback]", error);
		return page(
			"GitHub was not connected",
			"Something went wrong; try again from Superset.",
			500,
		);
	}
}

function page(title: string, detail: string, status: number): Response {
	const escapeHtml = (text: string) =>
		text.replace(
			/[&<>"]/g,
			(char) =>
				({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ??
				char,
		);
	return new Response(
		`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><body style="font:15px -apple-system,system-ui,sans-serif;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:0 16px"><main style="max-width:32rem"><h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(title)}</h1><p style="color:#aaa;margin:0">${escapeHtml(detail)}</p></main>`,
		{ status, headers: { "content-type": "text/html; charset=utf-8" } },
	);
}
