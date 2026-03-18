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
}

export async function submitEnterpriseInquiry(data: EnterpriseFormData) {
	const { name, role, company, email, phone, message } = data;

	if (!name || !role || !company || !email) {
		return { success: false, error: "Missing required fields." };
	}

	const { error } = await resend.emails.send({
		from: "Superset <noreply@superset.sh>",
		to: "founders@superset.sh",
		replyTo: email,
		subject: `Enterprise inquiry from ${name} (${company})`,
		react: EnterpriseInquiryEmail({
			name,
			role,
			company,
			email,
			phone,
			message,
		}),
	});

	if (error) {
		console.error("Failed to send enterprise inquiry email:", error);
		return { success: false, error: "Something went wrong. Please try again." };
	}

	return { success: true };
}
