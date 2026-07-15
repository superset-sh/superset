"use server";

import { EnterpriseInquiryEmail } from "@superset/email/emails/enterprise-inquiry";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "@/env";
import { checkEmailFormRateLimit } from "@/lib/email-rate-limit";
import { sanitizeSingleLine, validateEmail } from "@/lib/form-utils";

const resend = new Resend(env.RESEND_API_KEY);

const enterpriseFormDataSchema = z.object({
	name: z.string(),
	role: z.string(),
	company: z.string(),
	email: z.string(),
	phone: z.string().optional().default(""),
	message: z.string().optional().default(""),
	honeypot: z.string().optional(),
});

export async function submitEnterpriseInquiry(data: unknown) {
	const parsedData = enterpriseFormDataSchema.safeParse(data);
	if (!parsedData.success) {
		return { success: false, error: "Invalid input detected." };
	}

	const { name, role, company, email, phone, message, honeypot } =
		parsedData.data;

	// Honeypot check - if filled, silently reject (don't leak that we detected a bot)
	if (honeypot && honeypot.length > 0) {
		return { success: false, error: "Something went wrong. Please try again." };
	}

	// Validate required fields exist
	if (!name || !role || !company || !email) {
		return { success: false, error: "Missing required fields." };
	}

	// Sanitize inputs FIRST to prevent header injection
	const sanitizedName = sanitizeSingleLine(name);
	const sanitizedRole = sanitizeSingleLine(role);
	const sanitizedCompany = sanitizeSingleLine(company);
	const sanitizedEmail = sanitizeSingleLine(email);
	const sanitizedPhone = phone ? sanitizeSingleLine(phone) : "";
	const sanitizedMessage = message ? sanitizeSingleLine(message) : "";

	// Ensure sanitized values are not empty (trimming might have removed everything)
	if (
		!sanitizedName ||
		!sanitizedRole ||
		!sanitizedCompany ||
		!sanitizedEmail
	) {
		return { success: false, error: "Invalid input detected." };
	}

	// Validate email format AFTER sanitization
	if (!validateEmail(sanitizedEmail)) {
		return { success: false, error: "Invalid email address." };
	}

	try {
		if (!(await checkEmailFormRateLimit(sanitizedEmail))) {
			return {
				success: false,
				error: "Too many messages. Please try again later.",
			};
		}

		const { error } = await resend.emails.send({
			from: "Superset <noreply@superset.sh>",
			to: "support@superset.sh",
			replyTo: sanitizedEmail,
			subject: `Enterprise inquiry from ${sanitizedName} (${sanitizedCompany})`,
			react: EnterpriseInquiryEmail({
				name: sanitizedName,
				role: sanitizedRole,
				company: sanitizedCompany,
				email: sanitizedEmail,
				phone: sanitizedPhone,
				message: sanitizedMessage,
			}),
		});

		if (error) {
			console.error("Failed to send enterprise inquiry email:", error);
			return {
				success: false,
				error: "Something went wrong. Please try again.",
			};
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to send enterprise inquiry email:", error);
		return { success: false, error: "Something went wrong. Please try again." };
	}
}
