import { type ExecGh, execCli } from "./exec-gh";

export type ExecGlab = ExecGh;

// glab prints its reason to stderr; execFile's message repeats the whole command.
export const execGlab: ExecGlab = (...args) =>
	execCli("glab", ...args).catch((error) => {
		const reason = String(error?.stderr ?? "")
			.replace(/\s+/g, " ")
			.trim();
		throw reason
			? new Error(reason.replace(/^ERROR /, ""), { cause: error })
			: error;
	});
