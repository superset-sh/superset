"use server";

import { EnterpriseInquiryEmail } from "@superset/email/emails/enterprise-inquiry";
import { Resend } from "resend";
import { env } from "@/env";

const resend = new Resend(env.RESEND_API_KEY);

interface EnterpriseFormData {
	name: string;
	role: string;
	company: string;
	email: string;
	phone: string;
	message: string;
	honeypot?: string;
}

function validateEmail(email: string): boolean {
	// Basic email validation - check for @ with text before and after
	const parts = email.split("@");
	return (
		parts.length === 2 &&
		parts[0] !== undefined &&
		parts[0].length > 0 &&
		parts[1] !== undefined &&
		parts[1].length > 0 &&
		parts[1].includes(".")
	);
}

function sanitizeInput(input: string): string {
	// Remove control characters (CR, LF, null bytes) to prevent header injection
	return input.replace(/[\r\n\0]/g, "").trim();
}

export async function submitEnterpriseInquiry(data: EnterpriseFormData) {
	const { name, role, company, email, phone, message, honeypot } = data;

	// Honeypot check - if filled, silently reject (don't leak that we detected a bot)
	if (honeypot && honeypot.length > 0) {
		return { success: false, error: "Something went wrong. Please try again." };
	}

	// Validate required fields exist
	if (!name || !role || !company || !email) {
		return { success: false, error: "Missing required fields." };
	}

	// Sanitize inputs FIRST to prevent header injection
	const sanitizedName = sanitizeInput(name);
	const sanitizedRole = sanitizeInput(role);
	const sanitizedCompany = sanitizeInput(company);
	const sanitizedEmail = sanitizeInput(email);
	const sanitizedPhone = phone ? sanitizeInput(phone) : "";
	const sanitizedMessage = message ? sanitizeInput(message) : "";

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
		const { error } = await resend.emails.send({
			from: "Superset <noreply@superset.sh>",
			to: "founders@superset.sh",
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
