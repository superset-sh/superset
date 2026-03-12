import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { jwt } from "better-auth/plugins/jwt";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "./env";

const client = postgres(env.DATABASE_URL);
const db = drizzle(client);

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

if (env.GH_CLIENT_ID && env.GH_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: env.GH_CLIENT_ID,
    clientSecret: env.GH_CLIENT_SECRET,
  };
}

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  baseURL: env.NEXT_PUBLIC_API_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    storeSessionInDatabase: true,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  advanced: {
    crossSubDomainCookies: env.NEXT_PUBLIC_COOKIE_DOMAIN
      ? { enabled: true, domain: env.NEXT_PUBLIC_COOKIE_DOMAIN }
      : undefined,
    database: {
      generateId: false,
    },
  },
  socialProviders,
  plugins: [
    organization({
      creatorRole: "owner",
    }),
    jwt({
      jwks: {
        keyPairConfig: { alg: "RS256" },
      },
      jwt: {
        issuer: env.NEXT_PUBLIC_API_URL,
        audience: env.NEXT_PUBLIC_API_URL,
        expirationTime: "1h",
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;
