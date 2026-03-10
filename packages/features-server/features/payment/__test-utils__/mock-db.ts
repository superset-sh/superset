/**
 * 강화된 chainable Drizzle mock DB factory.
 * notification.service.spec.ts 패턴 확장:
 * - db.query.{table}.findFirst/findMany 지원
 * - db.transaction(async (tx) => {...}) 지원
 * - onConflictDoUpdate/innerJoin/leftJoin 체인 지원
 */

type ResolveEntry = { method: string; value: any };

function createChainableDb() {
  const resolveQueue: ResolveEntry[] = [];

  const chain: any = {};
  const methods = [
    'select', 'from', 'where', 'limit', 'offset', 'orderBy',
    'insert', 'values', 'returning', 'update', 'set', 'delete',
    'onConflictDoUpdate', 'innerJoin', 'leftJoin', 'groupBy',
    'having', 'execute',
  ];

  methods.forEach((method) => {
    chain[method] = jest.fn().mockImplementation(() => {
      if (resolveQueue.length > 0) {
        const next = resolveQueue[0];
        if (next!.method === method || next!.method === 'any') {
          resolveQueue.shift();
          return Promise.resolve(next!.value);
        }
      }
      return chain;
    });
  });

  chain._queueResolve = (method: string, value: any) => {
    resolveQueue.push({ method, value });
  };

  chain._resetQueue = () => {
    resolveQueue.length = 0;
  };

  return chain;
}

export function createMockDb() {
  const db = createChainableDb();

  // db.query.{table}.findFirst / findMany — Proxy 기반 동적 생성
  const queryHandlers: Record<string, Record<string, jest.Mock>> = {};

  db.query = new Proxy(
    {},
    {
      get: (_target: any, tableName: string) => {
        if (!queryHandlers[tableName]) {
          queryHandlers[tableName] = {
            findFirst: jest.fn(),
            findMany: jest.fn(),
          };
        }
        return queryHandlers[tableName];
      },
    },
  );

  // db.transaction(async (tx) => {...})
  // tx는 db와 동일한 chainable + query mock
  const txDb = createChainableDb();
  const txQueryHandlers: Record<string, Record<string, jest.Mock>> = {};
  txDb.query = new Proxy(
    {},
    {
      get: (_target: any, tableName: string) => {
        if (!txQueryHandlers[tableName]) {
          txQueryHandlers[tableName] = {
            findFirst: jest.fn(),
            findMany: jest.fn(),
          };
        }
        return txQueryHandlers[tableName];
      },
    },
  );

  db.transaction = jest.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
    return callback(txDb);
  });

  // 테스트에서 tx mock에 접근
  db._tx = txDb;

  return db;
}
