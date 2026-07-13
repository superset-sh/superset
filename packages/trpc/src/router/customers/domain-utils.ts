import { COMPANY } from "@superset/shared/constants";
import { z } from "zod";

export const COMPANY_DOMAIN = COMPANY.EMAIL_DOMAIN.replace(/^@/, "");

export const FREEMAIL_DOMAINS = new Set([
	"gmail.com",
	"googlemail.com",
	"outlook.com",
	"hotmail.com",
	"live.com",
	"msn.com",
	"yahoo.com",
	"ymail.com",
	"icloud.com",
	"me.com",
	"mac.com",
	"proton.me",
	"protonmail.com",
	"pm.me",
	"aol.com",
	"gmx.com",
	"gmx.de",
	"web.de",
	"mail.com",
	"mail.ru",
	"yandex.ru",
	"yandex.com",
	"qq.com",
	"163.com",
	"126.com",
	"hey.com",
	"fastmail.com",
	"duck.com",
	"naver.com",
]);

/** Valid domain chars only — also keeps ILIKE patterns free of wildcards. */
export const domainSchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z0-9][a-z0-9.-]{0,252}$/, "Invalid domain");
