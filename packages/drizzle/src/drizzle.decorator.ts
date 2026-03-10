import { Inject } from "@nestjs/common";
import { DRIZZLE } from "./database.module";

/**
 * Drizzle DB Injection Decorator
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}
 * }
 * ```
 */
export const InjectDrizzle = () => Inject(DRIZZLE);
