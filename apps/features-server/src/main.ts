import { config } from 'dotenv';
import { resolve } from 'path';

// NestJS ConfigModule은 process.env를 자동 주입하지 않으므로,
// 부트스트랩 전에 dotenv를 직접 로드하여 process.env에 값을 채움
config({ path: resolve(__dirname, '../../../.env.local') });
config({ path: resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { trpcRouter } from './trpc';
import { DRIZZLE, type DrizzleDB } from '@superbuilder/drizzle';
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import type { TrpcRouter } from './trpc';
import { parseJwtFromHeader } from '@superbuilder/features-server/core/nestjs/auth';
import { GlobalExceptionFilter } from '@superbuilder/features-server/core/error';
import {
  initPostHogServer,
  shutdownPostHogServer,
  captureServerError,
} from '@superbuilder/features-server/core/analytics';
import { initOtelSdk, shutdownOtelSdk } from '@superbuilder/features-server/core/logger';
import { RequestLoggerInterceptor } from '@superbuilder/features-server/core/logger/nestjs';

let cachedApp: NestFastifyApplication | null = null;

export async function getApp(): Promise<NestFastifyApplication> {
  if (cachedApp) return cachedApp;
  cachedApp = await bootstrap() as NestFastifyApplication;
  return cachedApp;
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ maxParamLength: 500 }),
  );

  // OpenTelemetry Logs SDK 초기화
  if (process.env.POSTHOG_API_KEY) {
    initOtelSdk({
      serviceName: 'atlas-server',
      posthogApiKey: process.env.POSTHOG_API_KEY,
      posthogHost: process.env.POSTHOG_HOST,
    });
  }

  // PostHog 초기화
  if (process.env.POSTHOG_API_KEY) {
    initPostHogServer({
      apiKey: process.env.POSTHOG_API_KEY,
      host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
    });
  }

  // Global prefix for REST API
  app.setGlobalPrefix('api');

  // CORS — 허용 origin 화이트리스트
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
      ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Request Logger (구조화 로그)
  app.useGlobalInterceptors(new RequestLoggerInterceptor());

  // Get DB instance for tRPC context
  const db = app.get<DrizzleDB>(DRIZZLE);

  // Fastify instance
  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;

  // Swagger (OpenAPI) — JSON spec + inline Swagger UI (CDN)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Feature Atlas API')
    .setDescription('Feature Atlas Server REST API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // JSON spec 엔드포인트
  fastify.get('/api-docs/json', (_req, reply) => {
    reply.send(document);
  });

  // Swagger UI — CDN에서 로드하는 인라인 HTML
  fastify.get('/api-docs', (_req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Feature Atlas API - Swagger</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api-docs/json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      deepLinking: true,
    });
  </script>
</body>
</html>`);
  });

  // Raw body 캡처 (웹훅 서명 검증용)
  // preParsing hook으로 웹훅 경로의 raw body만 저장
  fastify.addHook('preParsing', async (request, _reply, payload) => {
    if (request.url?.startsWith('/api/webhook/')) {
      const chunks: Buffer[] = [];
      for await (const chunk of payload as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      (request as any).rawBody = rawBody;

      // raw body를 다시 스트림으로 반환하여 JSON 파서가 처리 가능하게 함
      const { Readable } = await import('stream');
      return Readable.from(Buffer.from(rawBody));
    }
  });

  // Security headers (Helmet)
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // SPA 클라이언트와 호환을 위해 별도 설정
  });

  // Multipart (file upload)
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // tRPC
  await fastify.register(fastifyTRPCPlugin<TrpcRouter>, {
    prefix: '/trpc',
    trpcOptions: {
      router: trpcRouter,
      createContext: async ({ req, res }) => {
        const user = parseJwtFromHeader(req.headers.authorization);
        return { req, res, db, user };
      },
      onError: ({ error, path, req }) => {
        // 모든 에러 로깅 (디버깅용)
        if (error.code !== 'UNAUTHORIZED') {
          console.error(
            `[tRPC Error] ${path}:`,
            error.code,
            error.message,
            error.cause ? `cause: ${error.cause}` : '',
          );
        }
        if (error.code === 'INTERNAL_SERVER_ERROR') {
          captureServerError({
            path: `/trpc/${path}`,
            method: 'TRPC',
            statusCode: 500,
            errorMessage: error.message,
            errorCode: error.code,
            requestId: (req as { id?: string }).id,
            stack: error.stack,
          });
        }
      },
    },
  } as FastifyTRPCPluginOptions<TrpcRouter>);

  // Graceful shutdown
  app.enableShutdownHooks();
  process.on('SIGTERM', async () => {
    await shutdownOtelSdk();
    await shutdownPostHogServer();
  });
  process.on('SIGINT', async () => {
    await shutdownOtelSdk();
    await shutdownPostHogServer();
  });

  if (process.env.VERCEL) {
    await app.init();
    await (app.getHttpAdapter().getInstance() as FastifyInstance).ready();
  } else {
    const port = process.env.PORT ?? 3002;
    await app.listen(port, '0.0.0.0');
    console.log(`Atlas Server running on http://localhost:${port}`);
    console.log(`REST API: http://localhost:${port}/api`);
    console.log(`Swagger: http://localhost:${port}/api-docs`);
    console.log(`tRPC: http://localhost:${port}/trpc`);
  }

  return app;
}

if (!process.env.VERCEL) {
  bootstrap();
}
