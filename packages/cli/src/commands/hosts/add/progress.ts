import * as p from "@clack/prompts";

export interface Progress {
	intro: (message: string) => void;
	info: (message: string) => void;
	start: (message: string) => void;
	stop: (message: string) => void;
	outro: (message: string) => void;
}

const silent: Progress = {
	intro: () => {},
	info: () => {},
	start: () => {},
	stop: () => {},
	outro: () => {},
};

/**
 * Clack draws on stdout, and `--json` is auto-on under CI and agent
 * environments — so drawing progress there would wrap the JSON result in
 * chatter and break every caller that parses it. Only a human gets the show.
 */
export function createProgress(interactive: boolean): Progress {
	if (!interactive) return silent;

	const spinner = p.spinner();
	let spinning = false;
	return {
		intro: (message) => p.intro(message),
		info: (message) => p.log.info(message),
		start: (message) => {
			spinner.start(message);
			spinning = true;
		},
		stop: (message) => {
			if (!spinning) return;
			spinner.stop(message);
			spinning = false;
		},
		outro: (message) => p.outro(message),
	};
}
