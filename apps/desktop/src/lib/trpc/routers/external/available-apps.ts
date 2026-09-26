import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExternalApp } from "@superset/local-db";
import {
	getMacOSAppProbes,
	MACOS_EXTERNAL_APPS,
	type MacOSAppProbe,
} from "./helpers";

const execFileAsync = promisify(execFile);

export interface MacOSAppDescriptor {
	id: ExternalApp;
	probes: MacOSAppProbe[];
}

export const MACOS_AVAILABILITY_SCRIPT = `
ObjC.import("AppKit");

function run(argv) {
  const descriptors = JSON.parse(argv[0]);
  const workspace = $.NSWorkspace.sharedWorkspace;
  const available = descriptors.filter((descriptor) =>
    descriptor.probes.some((probe) => {
      const raw = probe.type === "bundleId"
        ? workspace.URLForApplicationWithBundleIdentifier(probe.value)
        : workspace.fullPathForApplication(probe.value);
      const value = ObjC.unwrap(raw);
      return value !== undefined && value !== null;
    })
  ).map((descriptor) => descriptor.id);
  return JSON.stringify(available);
}
`;

type RunMacOSScript = (
	descriptors: readonly MacOSAppDescriptor[],
) => Promise<string>;

async function runMacOSAvailabilityScript(
	descriptors: readonly MacOSAppDescriptor[],
): Promise<string> {
	const { stdout } = await execFileAsync(
		"/usr/bin/osascript",
		[
			"-l",
			"JavaScript",
			"-e",
			MACOS_AVAILABILITY_SCRIPT,
			JSON.stringify(descriptors),
		],
		{ shell: false, timeout: 5_000, maxBuffer: 65_536 },
	);
	return stdout;
}

export async function detectAvailableExternalApps(
	platform: NodeJS.Platform = process.platform,
	runMacOSScript: RunMacOSScript = runMacOSAvailabilityScript,
): Promise<ExternalApp[] | null> {
	if (platform !== "darwin") return null;

	const descriptors = MACOS_EXTERNAL_APPS.flatMap((id) => {
		const probes = getMacOSAppProbes(id);
		return probes.length > 0 ? [{ id, probes }] : [];
	});
	const parsed: unknown = JSON.parse(await runMacOSScript(descriptors));
	if (
		!Array.isArray(parsed) ||
		parsed.some(
			(id) =>
				typeof id !== "string" ||
				!MACOS_EXTERNAL_APPS.includes(id as ExternalApp),
		)
	) {
		throw new Error("Invalid macOS external-app availability response");
	}

	return [
		"finder",
		...new Set((parsed as ExternalApp[]).filter((id) => id !== "finder")),
	];
}

export function createExternalAppAvailabilityCache(
	detect: () => Promise<ExternalApp[] | null> = () =>
		detectAvailableExternalApps(),
) {
	let detectionPromise: Promise<ExternalApp[] | null> | undefined;
	return () => {
		detectionPromise ??= detect().catch((error) => {
			console.warn("[external/availableApps] Detection failed:", error);
			return null;
		});
		return detectionPromise;
	};
}

export const getExternalAppAvailability = createExternalAppAvailabilityCache();
