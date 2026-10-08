import { readFileSync } from "node:fs";
import { SANDBOX_PATHS, SANDBOX_USER } from "@superset/shared/sandbox-contract";
import { coldStop, rootExec } from "@superset/trpc/lib/sandbox/freestyle-vm";
import { Freestyle } from "freestyle";
import { type BuiltBundle, buildBundle } from "./build";

import { aptList, BUN_VERSION, GO_SHA256, GO_VERSION } from "./image-config";

export async function buildFreestyleImage(
	bundle: BuiltBundle,
	slug: string,
): Promise<string> {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 63)
		throw new Error("Invalid snapshot slug");
	if (!process.env.FREESTYLE_API_KEY)
		throw new Error("FREESTYLE_API_KEY is required");
	const client = new Freestyle({ apiKey: process.env.FREESTYLE_API_KEY });
	const { vm } = await client.vms.create({
		snapshotId: process.env.FREESTYLE_BASE_SNAPSHOT_ID ?? "freestyle/ubuntu-lg",
		firewall: {
			rules: [{ action: "allow", source: {}, destination: { public: true } }],
		},
		autoDeleteSeconds: 3600,
		ttlSeconds: 3600,
		automaticRestart: false,
	});
	try {
		console.log(`Installing bundle ${bundle.sha256} in ${vm.id}`);
		await rootExec(
			vm,
			`set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ${aptList("base")} ${aptList("toolchain")}
apt-get install -y ${aptList("desktop")}
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/github-cli-archive-keyring.gpg
echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/github-cli-archive-keyring.gpg] https://cli.github.com/packages stable main' > /etc/apt/sources.list.d/github-cli.list
apt-get update
apt-get install -y gh
curl -fsSL -o /tmp/go.tgz https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz
echo "${GO_SHA256}  /tmp/go.tgz" | sha256sum -c -
rm -rf /usr/local/go
tar -C /usr/local -xzf /tmp/go.tgz
rm /tmp/go.tgz
ln -sfn /usr/local/go/bin/go /usr/local/bin/go
ln -sfn /usr/local/go/bin/gofmt /usr/local/bin/gofmt
npm install -g bun@${BUN_VERSION} --no-audit --no-fund
node --version; docker --version; gh --version; go version; bun --version
install -d -o ${SANDBOX_USER} -g ${SANDBOX_USER} ${SANDBOX_PATHS.workspace} ${SANDBOX_PATHS.state} ${SANDBOX_PATHS.logs} /etc/superset
install -d ${SANDBOX_PATHS.bundleRoot} ${SANDBOX_PATHS.hostRoot} ${SANDBOX_PATHS.media} ${SANDBOX_PATHS.steps}`,
		);
		await vm.fs.writeFile(
			"/tmp/superset-bundle.tar.gz",
			readFileSync(bundle.tarball),
		);
		const target = `${SANDBOX_PATHS.bundleRoot}/${bundle.sha256}`;
		await rootExec(
			vm,
			`set -eu
echo '${bundle.sha256}  /tmp/superset-bundle.tar.gz' | sha256sum -c -
mkdir -p ${target}
tar -xzf /tmp/superset-bundle.tar.gz -C ${target}
chmod 755 ${target}/setup
ln -sfn ${target} ${SANDBOX_PATHS.bundleRoot}/current
echo ${bundle.sha256} > ${SANDBOX_PATHS.bundleRoot}/current.bundle-hash
${target}/setup apply-rootfs
${target}/setup sync-assets`,
		);
		for (const step of bundle.steps) {
			console.log(`Running ${step.name}`);
			await rootExec(vm, `${target}/setup run-step ${step.name}`);
		}
		await rootExec(
			vm,
			"rm -f /tmp/superset-bundle.tar.gz; rm -rf /var/lib/apt/lists/*",
		);
		await coldStop(vm);
		await vm.start();
		const snapshot = await vm.snapshot({ slug, autoDeleteSeconds: -1 });
		console.log(`FREESTYLE_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
		return snapshot.snapshotId;
	} finally {
		await vm.delete();
	}
}

if (import.meta.main) {
	const slug = process.argv[2];
	if (!slug)
		throw new Error("Usage: bun run image:freestyle <new-snapshot-slug>");
	await buildFreestyleImage(buildBundle(), slug);
}
