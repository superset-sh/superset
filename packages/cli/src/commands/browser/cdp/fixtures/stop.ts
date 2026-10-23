import stop from "../../cdp-stop/command";

await stop.run({
	ctx: {},
	options: { id: process.argv[2] ?? "" },
	args: {},
	signal: new AbortController().signal,
});
