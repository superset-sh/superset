// Ad-hoc probe: what environment does a harness pty terminal actually get?
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliE2EHarness } from "./harness";

const repoRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../..",
);
const harness = new CliE2EHarness({
	repoRoot,
	artifactsDir: "test-results/cli-grok-env-probe",
});
let failure: unknown;
try {
	await harness.start();
	await harness.cli({
		name: "probe terminal env",
		args: [
			"terminals",
			"create",
			"--workspace",
			harness.workspaceId,
			"--command",
			"{ env | grep -E 'SUPERSET|PATH=' ; echo WHICH_GROK=$(which grok) ; } > /tmp/harness-term-probe.txt 2>&1",
		],
	});
	await Bun.sleep(8_000);
	console.log(await Bun.file("/tmp/harness-term-probe.txt").text());
} catch (error) {
	failure = error;
} finally {
	await harness.finish(failure);
}
if (failure) throw failure;
