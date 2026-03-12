import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, genericOAuth } from "better-auth/plugins";
import { jwt } from "better-auth/plugins/jwt";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { profiles } from "@superbuilder/features-db";
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

/** genericOAuth providers (Naver 등 OIDC 미지원 프로바이더) */
const genericOAuthConfig: Parameters<typeof genericOAuth>[0]["config"] = [];

if (env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET) {
  genericOAuthConfig.push({
    providerId: "naver",
    clientId: env.NAVER_CLIENT_ID,
    clientSecret: env.NAVER_CLIENT_SECRET,
    authorizationUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    scopes: [],
    getUserInfo: async (tokens) => {
      const response = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      const data = await response.json() as {
        resultcode: string;
        response: { id: string; email: string; name: string; nickname: string; profile_image: string };
      };
      if (data.resultcode !== "00") {
        throw new Error("Failed to fetch Naver user profile");
      }
      const profile = data.response;
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.profile_image,
        emailVerified: true,
      };
    },
  });
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
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Better Auth user 생성 시 profiles 테이블에도 레코드 동기화
          // 기존 Feature들이 profiles를 FK 참조하므로 필수
          const existing = await db
            .select({ id: profiles.id })
            .from(profiles)
            .where(eq(profiles.id, user.id))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(profiles).values({
              id: user.id,
              name: user.name,
              email: user.email,
              avatar: user.image ?? null,
              authProvider: "email",
            });
          }
        },
      },
      update: {
        after: async (user) => {
          // Better Auth user 업데이트 시 profiles도 동기화
          await db
            .update(profiles)
            .set({
              ...(user.name ? { name: user.name } : {}),
              ...(user.email ? { email: user.email } : {}),
              ...(user.image !== undefined ? { avatar: user.image } : {}),
              updatedAt: new Date(),
            })
            .where(eq(profiles.id, user.id));
        },
      },
    },
  },
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
    ...(genericOAuthConfig.length > 0
      ? [genericOAuth({ config: genericOAuthConfig })]
      : []),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;
