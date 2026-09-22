/**
 * Builds the sandbox image and pushes it to Vercel Container Registry, where
 * Sandbox.create() pulls it by repository name.
 *
 *   bun run image             build linux/amd64 and push
 *   bun run image --dry       print the Dockerfile only
 *   bun run image --local     build into the local Docker daemon as
 *                             superset-sandbox:local (the boot-twice test)
 *
 * The image is the OS, the toolchain, the desktop packages and the sandbox
 * user; everything of ours arrives through the bundle, which the build
 * installs at /opt/superset/bundle/<sha>/ and runs once, so a fresh box
 * boots with every hash sidecar and step marker already matching. Nothing
 * here downloads without a checksum: apt verifies its packages, the bundle
 * verifies its assets, and the vendor repositories are keyed.
 *
 * Needs Docker with Buildx and, for a push, VERCEL_SANDBOX_TOKEN,
 * VERCEL_SANDBOX_TEAM_ID and VERCEL_SANDBOX_PROJECT_ID: the push logs itself in.
 */
import {
	cpSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SANDBOX_IMAGE_NAME } from "@superset/shared/constants";
import {
	SANDBOX_PATHS,
	SANDBOX_PORTS,
	SANDBOX_USER,
} from "@superset/shared/sandbox-contract";
import { type BuiltBundle, buildBundle, PACKAGE_ROOT } from "./build";
import { loginToRegistry } from "./registry";

const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const IMAGE_TAG = process.env.SANDBOX_IMAGE_TAG ?? "latest";
const LOCAL_IMAGE = "superset-sandbox:local";

// The repo pins bun once, in .bun-version; a sandbox on any other version
// rejects the frozen lockfile and every dependency install fails.
const BUN_VERSION = readFileSync(
	join(REPO_ROOT, ".bun-version"),
	"utf8",
).trim();
const GO_VERSION = "1.27.1";
/** Pinned by `bun run assets go`; verified before the tarball is unpacked. */
const GO_SHA256 =
	"63d339f0da5ab53635a56f2490a7984dfe12dfcff22ad749f63edaf590168445";
const AGENT_CLI_VERSIONS = { claudeCode: "2.1.257", codex: "0.152.0" } as const;

function aptList(name: string): string {
	return readFileSync(
		join(
			PACKAGE_ROOT,
			"bundle",
			"rootfs",
			"usr",
			"local",
			"share",
			"superset",
			`${name}.Aptfile`,
		),
		"utf8",
	)
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"))
		.join(" ");
}

export function dockerfile(bundle: BuiltBundle): string {
	const bundleDir = `${SANDBOX_PATHS.bundleRoot}/${bundle.sha256}`;
	return `FROM node:24-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ${aptList("base")} \\
 && apt-get install -y --no-install-recommends ${aptList("toolchain")} \\
 && apt-get install -y ${aptList("desktop")} \\
 && rm -rf /var/lib/apt/lists/*
# Docker, the GitHub CLI and Go from their vendors: Debian's lag by years.
RUN install -m 0755 -d /etc/apt/keyrings \\
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \\
 && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \\
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \\
 && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \\
 && apt-get update && apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin gh \\
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL -o /tmp/go.tgz https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz \\
 && echo "${GO_SHA256}  /tmp/go.tgz" | sha256sum -c - \\
 && tar -C /usr/local -xzf /tmp/go.tgz && rm /tmp/go.tgz
RUN npm install -g bun@${BUN_VERSION} --no-audit --no-fund && bun --version
# The agents the sandbox can run; a sandbox has none of the user's local ones.
RUN npm install -g @anthropic-ai/claude-code@${AGENT_CLI_VERSIONS.claudeCode} @openai/codex@${AGENT_CLI_VERSIONS.codex} --no-audit --no-fund && claude --version && codex --version
# The sandbox user: the reference and the platform's own images run as one
# with passwordless sudo; root is the boot runner only.
# The base image ships a \`node\` user on uid 1000; ours takes that uid.
RUN userdel -r node 2>/dev/null; useradd -m -u 1000 -s /bin/bash -d ${SANDBOX_PATHS.home} ${SANDBOX_USER} \\
 && install -d -o ${SANDBOX_USER} -g ${SANDBOX_USER} ${SANDBOX_PATHS.workspace} ${SANDBOX_PATHS.state} ${SANDBOX_PATHS.logs} \\
 && install -d ${SANDBOX_PATHS.bundleRoot} ${SANDBOX_PATHS.hostRoot} ${SANDBOX_PATHS.media} ${SANDBOX_PATHS.steps} \
 && install -d -o ${SANDBOX_USER} -g ${SANDBOX_USER} /etc/superset
# The bundle: installed at its hash, run once so a fresh box has nothing to do.
COPY bundle/ ${bundleDir}/
RUN chmod 755 ${bundleDir}/setup && ln -s ${bundleDir} ${SANDBOX_PATHS.bundleRoot}/current \\
 && echo ${bundle.sha256} > ${SANDBOX_PATHS.bundleRoot}/current.bundle-hash \\
 && ${bundleDir}/setup apply-rootfs \\
 && ${bundleDir}/setup sync-assets \\
 && for step in ${bundle.steps.map((s) => s.name).join(" ")}; do ${bundleDir}/setup run-step $step || exit 1; done \\
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
EXPOSE ${SANDBOX_PORTS.hostService} ${SANDBOX_PORTS.desktop}
USER ${SANDBOX_USER}
WORKDIR ${SANDBOX_PATHS.workspace}
# No ENTRYPOINT: the platform runs none for custom images. The control plane
# runs /usr/local/bin/superset-boot as root through the sandbox API.
`;
}

function assembleContext(bundle: BuiltBundle): string {
	const context = mkdtempSync(join(tmpdir(), "superset-sandbox-image-"));
	cpSync(bundle.dir, join(context, "bundle"), { recursive: true });
	writeFileSync(join(context, "Dockerfile"), dockerfile(bundle));
	return context;
}

export const IMAGE_REF = `${SANDBOX_IMAGE_NAME}:${IMAGE_TAG}`;

/** Builds the image from a built bundle; pushes unless `local`. Returns the image reference. */
export async function buildImage(
	bundle: BuiltBundle,
	options: { local: boolean },
): Promise<string> {
	const local = options.local;
	const context = assembleContext(bundle);
	try {
		const command = local
			? [
					"docker",
					"buildx",
					"build",
					"--platform",
					"linux/amd64",
					"--load",
					"-t",
					LOCAL_IMAGE,
					context,
				]
			: [
					"docker",
					"buildx",
					"build",
					"--platform",
					"linux/amd64",
					"--output",
					`type=image,name=${await loginToRegistry()}/${IMAGE_REF},push=true,oci-mediatypes=true,compression=zstd,compression-level=3,force-compression=true`,
					context,
				];
		console.log(
			`building bundle ${bundle.sha256.slice(0, 12)} into ${local ? LOCAL_IMAGE : IMAGE_REF}`,
		);
		const build = Bun.spawnSync(command, {
			stdout: "inherit",
			stderr: "inherit",
		});
		if (build.exitCode !== 0)
			throw new Error(`image build exited ${build.exitCode}`);
		console.log(`built: ${local ? LOCAL_IMAGE : IMAGE_REF}`);
		return local ? LOCAL_IMAGE : IMAGE_REF;
	} finally {
		rmSync(context, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const bundle = buildBundle();
	if (process.argv.includes("--dry")) {
		console.log(dockerfile(bundle));
		process.exit(0);
	}
	await buildImage(bundle, { local: process.argv.includes("--local") });
}
