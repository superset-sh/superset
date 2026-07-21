import * as semver from "semver";
import { z } from "zod";

/**
 * Wire format for server-driven desktop notices, returned by
 * `GET /api/desktop/version` alongside the legacy `minimumVersion` gate.
 * See plans/20260720-remote-version-notices.md.
 */

export const desktopNoticeSeveritySchema = z.enum([
	"info",
	"warning",
	"blocking",
]);
export type DesktopNoticeSeverity = z.infer<typeof desktopNoticeSeveritySchema>;

export const desktopNoticeTriggerSchema = z.enum([
	"immediate",
	"pre-update",
	"post-update",
]);
export type DesktopNoticeTrigger = z.infer<typeof desktopNoticeTriggerSchema>;

export const desktopNoticeCtaSchema = z.object({
	label: z.string(),
	action: z.enum(["install-update", "open-url"]),
	url: z.string().nullish(),
});
export type DesktopNoticeCta = z.infer<typeof desktopNoticeCtaSchema>;

export const desktopNoticeSchema = z.object({
	id: z.string(),
	severity: desktopNoticeSeveritySchema,
	trigger: desktopNoticeTriggerSchema,
	minVersion: z.string().nullish(),
	maxVersion: z.string().nullish(),
	platforms: z.array(z.string()).nullish(),
	channels: z.array(z.string()).nullish(),
	title: z.string(),
	body: z.string(),
	cta: desktopNoticeCtaSchema.nullish(),
	dismissible: z.boolean(),
});
export type DesktopNotice = z.infer<typeof desktopNoticeSchema>;

export const desktopVersionResponseSchema = z.object({
	minimumVersion: z.string(),
	message: z.string(),
	// older servers don't return this field
	notices: z.array(desktopNoticeSchema).default([]),
});
export type DesktopVersionResponse = z.infer<
	typeof desktopVersionResponseSchema
>;

export const SEVERITY_RANK: Record<DesktopNoticeSeverity, number> = {
	blocking: 2,
	warning: 1,
	info: 0,
};

export interface NoticeClientContext {
	appVersion: string;
	platform: string;
	channel: "stable" | "canary";
	/** Version this install ran before its most recent update; null on fresh installs. */
	previousVersion: string | null;
	isDismissed: (id: string) => boolean;
}

export function noticeApplies(
	notice: DesktopNotice,
	ctx: NoticeClientContext,
): boolean {
	if (notice.dismissible && ctx.isDismissed(notice.id)) return false;
	if (notice.platforms?.length && !notice.platforms.includes(ctx.platform))
		return false;
	if (notice.channels?.length && !notice.channels.includes(ctx.channel))
		return false;

	const version = semver.coerce(ctx.appVersion);
	// fail open on an unparseable version rather than spamming everyone
	if (!version) return false;
	if (notice.minVersion && semver.lt(version, notice.minVersion)) return false;
	if (notice.maxVersion && semver.gt(version, notice.maxVersion)) return false;

	// post-update = release announcement: only for installs that updated INTO
	// the announced version (previousVersion below minVersion); never for
	// fresh installs, which have no previous version.
	if (notice.trigger === "post-update") {
		const prev = ctx.previousVersion
			? semver.coerce(ctx.previousVersion)
			: null;
		if (!prev) return false;
		if (notice.minVersion && !semver.lt(prev, notice.minVersion)) return false;
	}
	return true;
}

/** Applicable notices, highest severity first. */
export function filterApplicableNotices(
	notices: DesktopNotice[],
	ctx: NoticeClientContext,
): DesktopNotice[] {
	return notices
		.filter((n) => noticeApplies(n, ctx))
		.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
