const ATLAS_SERVER_URL =
  process.env.ATLAS_SERVER_URL || "http://localhost:3002";

interface CheckBalanceResult {
  sufficient: boolean;
  currentBalance: number;
  estimatedCost: number;
  remaining: number;
}

interface DeductResult {
  transaction: unknown;
  balanceBefore: number;
  balanceAfter: number;
}

interface CalculateResult {
  credits: number;
}

export class CreditError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "CreditError";
  }
}

async function fetchCredits<T>(
  path: string,
  jwt: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(
    `${ATLAS_SERVER_URL}/api/internal/credits/${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ message: "Credit API error" }));
    throw new CreditError(
      res.status,
      (error as { message?: string }).message ?? "Credit API error",
    );
  }

  return res.json() as T;
}

/**
 * 크레딧 잔액 확인
 */
export async function checkCredits(
  jwt: string,
  estimatedCredits: number,
): Promise<CheckBalanceResult> {
  return fetchCredits<CheckBalanceResult>("check", jwt, { estimatedCredits });
}

/**
 * 크레딧 차감
 */
export async function deductCredits(
  jwt: string,
  amount: number,
  metadata?: {
    modelId?: string;
    provider?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    messageId?: string;
    threadId?: string;
  },
): Promise<DeductResult> {
  return fetchCredits<DeductResult>("deduct", jwt, { amount, metadata });
}

/**
 * 토큰 → 크레딧 환산
 */
export async function calculateCredits(
  jwt: string,
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): Promise<number> {
  const result = await fetchCredits<CalculateResult>("calculate", jwt, {
    modelId,
    promptTokens,
    completionTokens,
  });
  return result.credits;
}
