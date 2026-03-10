import { Module, Global, DynamicModule, InjectionToken } from "@nestjs/common";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema, type Schema } from "./schema-registry";

export const DRIZZLE = Symbol("DRIZZLE");

export interface DatabaseModuleOptions {
  connectionString: string;
  schema?: Record<string, unknown>;
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    const client = postgres(options.connectionString);
    const db = drizzle(client, { schema: options.schema || schema });

    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DRIZZLE,
          useValue: db,
        },
      ],
      exports: [DRIZZLE],
    };
  }

  static forRootAsync(options: {
    useFactory: (
      ...args: unknown[]
    ) => Promise<DatabaseModuleOptions> | DatabaseModuleOptions;
    inject?: InjectionToken[];
  }): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DRIZZLE,
          useFactory: async (...args: unknown[]) => {
            const config = await options.useFactory(...args);
            const client = postgres(config.connectionString);
            return drizzle(client, { schema: config.schema || schema });
          },
          inject: options.inject || [],
        },
      ],
      exports: [DRIZZLE],
    };
  }
}

export type DrizzleDB = PostgresJsDatabase<Schema>;

// Alias for backwards compatibility
export { DatabaseModule as DrizzleModule };
