import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
	if (_resend) {
		return _resend;
	}

	if (!process.env.RESEND_API_KEY) {
		throw new Error("RESEND_API_KEY is not set");
	}

	_resend = new Resend(process.env.RESEND_API_KEY);
	return _resend;
}

export const resend = {
	emails: {
		send: (params: Parameters<Resend["emails"]["send"]>[0]) =>
			getResend().emails.send(params),
	},
};
