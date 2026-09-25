"use server";

import { msg } from "@lingui/core/macro";
import { DownloadLinkEmail } from "@superset/email/emails/marketing/DownloadLinkEmail";
import { isSupportedLocale } from "@superset/i18n/locales";
import { getI18nInstance, preloadServerLocale } from "@superset/i18n/server";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "@/env";
import { checkEmailFormRateLimit } from "@/lib/email-rate-limit";
import { sanitizeSingleLine } from "@/lib/form-utils";

const resend = new Resend(env.RESEND_API_KEY);

const downloadLinkSchema = z.object({
	email: z.string(),
	honeypot: z.string().optional(),
});

type SendDownloadLinkResult =
	| { success: true }
	| { success: false; error: string };

export async function sendDownloadLink(
	data: unknown,
	requestedLocale = "en",
): Promise<SendDownloadLinkResult> {
	const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";
	await preloadServerLocale(locale);
	const i18n = getI18nInstance(locale);
	const parsedData = downloadLinkSchema.safeParse(data);
	if (!parsedData.success) {
		return {
			success: false,
			error: i18n._(
				msg({
					message: "Enter a valid email address.",
				}),
			),
		};
	}

	const { email, honeypot } = parsedData.data;
	if (honeypot) {
		return {
			success: false,
			error: i18n._(
				msg({
					message: "Something went wrong. Please try again.",
				}),
			),
		};
	}

	const sanitizedEmail = sanitizeSingleLine(email).toLowerCase();
	if (!z.email().safeParse(sanitizedEmail).success) {
		return {
			success: false,
			error: i18n._(
				msg({
					message: "Enter a valid email address.",
				}),
			),
		};
	}

	try {
		if (!(await checkEmailFormRateLimit(sanitizedEmail))) {
			return {
				success: false,
				error: i18n._(
					msg({
						message: "Too many requests. Please try again later.",
					}),
				),
			};
		}

		const { error } = await resend.emails.send({
			from: "Superset <noreply@superset.sh>",
			to: sanitizedEmail,
			subject: "Your Superset download link",
			react: DownloadLinkEmail({ recipientEmail: sanitizedEmail }),
		});

		if (error) {
			console.error("Failed to send download link:", error);
			return {
				success: false,
				error: i18n._(
					msg({
						message: "Something went wrong. Please try again.",
					}),
				),
			};
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to send download link:", error);
		return {
			success: false,
			error: i18n._(
				msg({
					message: "Something went wrong. Please try again.",
				}),
			),
		};
	}
}
