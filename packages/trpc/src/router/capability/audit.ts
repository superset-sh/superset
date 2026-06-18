import type { ValidatedCapabilityPackage } from "./package-validation";
import type {
	CapabilityAuditFinding,
	CapabilityAuditResult,
	CapabilityManifest,
} from "./schema";

export interface AuditModelSelection {
	providerId: string;
	modelId: string;
	protocol: string;
}

function hasDangerousShellPattern(value: string): boolean {
	const normalized = value.toLowerCase();
	return [
		/\bsudo\b/,
		/\bnpm\s+install\s+-g\b/,
		/\bbun\s+install\s+-g\b/,
		/\byarn\s+global\b/,
		/\bpipx?\s+install\b.*--user\b/,
		/\bcurl\b.*\|\s*(?:sh|bash)\b/,
		/\bwget\b.*\|\s*(?:sh|bash)\b/,
		/rm\s+-rf\s+\/(?:\s|$)/,
		/\/usr\/local\/bin/,
		/>\s*~\//,
	].some((pattern) => pattern.test(normalized));
}

function auditCliManifest(
	manifest: Extract<CapabilityManifest, { type: "cli" }>,
) {
	const findings: CapabilityAuditFinding[] = [];
	for (const command of manifest.cli.install.commands) {
		if (hasDangerousShellPattern(command)) {
			findings.push({
				severity: "blocker",
				title: "Unsafe install command",
				description:
					"Install commands must stay inside Superset-managed directories and cannot use global installers or shell-piped downloads.",
			});
		}
	}

	if (manifest.cli.network) {
		findings.push({
			severity: "low",
			title: "Network access declared",
			description:
				"This CLI declares network access. Automation bindings should provide secrets by name only.",
		});
	}

	return findings;
}

function auditSkillFiles(pkg: ValidatedCapabilityPackage) {
	const findings: CapabilityAuditFinding[] = [];
	const skillEntry = pkg.entries.find((entry) =>
		entry.path.endsWith("SKILL.md"),
	);
	if (!skillEntry) return findings;

	const text = new TextDecoder().decode(skillEntry.data).toLowerCase();
	if (
		text.includes("ignore previous instructions") ||
		text.includes("exfiltrate") ||
		text.includes("send secrets")
	) {
		findings.push({
			severity: "high",
			title: "Prompt-injection language detected",
			description:
				"The Skill contains language that may override system context or expose secrets. Review before enabling.",
			path: skillEntry.path,
		});
	}
	return findings;
}

export function canActivateCapabilityVersion(args: {
	auditStatus: "pending" | "passed" | "failed";
}): boolean {
	return args.auditStatus === "passed";
}

export function auditValidatedCapabilityPackage(args: {
	pkg: ValidatedCapabilityPackage;
	model: AuditModelSelection | null;
}): CapabilityAuditResult {
	if (!args.model) {
		return {
			status: "failed",
			modelProviderId: null,
			modelId: null,
			summary:
				"No enabled audit model is configured for this organization. Configure a model provider before enabling imported Skills or CLI tools.",
			findings: [
				{
					severity: "blocker",
					title: "Audit model unavailable",
					description:
						"Superset requires a configured provider/model to audit capability packages before activation.",
				},
			],
		};
	}

	const manifest = args.pkg.manifest;
	const findings =
		manifest.type === "cli"
			? auditCliManifest(manifest)
			: auditSkillFiles(args.pkg);
	const hasBlocker = findings.some((finding) => finding.severity === "blocker");

	return {
		status: hasBlocker ? "failed" : "passed",
		modelProviderId: args.model.providerId,
		modelId: args.model.modelId,
		summary: hasBlocker
			? "The package contains blocked install or runtime patterns."
			: "The package passed the capability package security audit.",
		findings,
	};
}
