const hasRedisEnv =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

type MemoryCounter = { count: number; resetAt: number };
const memoryRateCounters = new Map<string, MemoryCounter>();
let memoryGenerateInFlight = 0;

async function redisCommand(parts: string[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const endpoint = `${url.replace(/\/$/, "")}/${parts.map((p) => encodeURIComponent(p)).join("/")}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`redis command failed: ${res.status}`);
  }
  const data = (await res.json()) as { result?: unknown };
  return data.result;
}

export async function checkRateLimit(
  scope: string,
  id: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; current: number }> {
  if (hasRedisEnv) {
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `rl:${scope}:${id}:${windowStart}`;
    const current = Number(await redisCommand(["INCR", key])) || 0;
    if (current === 1) {
      await redisCommand(["EXPIRE", key, String(windowSeconds + 2)]);
    }
    return { allowed: current <= maxRequests, current };
  }

  const key = `${scope}:${id}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const current = memoryRateCounters.get(key);
  if (!current || current.resetAt <= now) {
    memoryRateCounters.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, current: 1 };
  }
  current.count += 1;
  memoryRateCounters.set(key, current);
  return { allowed: current.count <= maxRequests, current: current.count };
}

export async function acquireGenerateSlot(maxInFlight: number): Promise<boolean> {
  if (hasRedisEnv) {
    const key = "concurrency:generate";
    const current = Number(await redisCommand(["INCR", key])) || 0;
    if (current === 1) {
      await redisCommand(["EXPIRE", key, "180"]);
    }
    if (current > maxInFlight) {
      await redisCommand(["DECR", key]);
      return false;
    }
    return true;
  }

  memoryGenerateInFlight += 1;
  if (memoryGenerateInFlight > maxInFlight) {
    memoryGenerateInFlight -= 1;
    return false;
  }
  return true;
}

export async function releaseGenerateSlot(): Promise<void> {
  if (hasRedisEnv) {
    try {
      await redisCommand(["DECR", "concurrency:generate"]);
    } catch {
      // Ignore release errors to avoid masking upstream responses.
    }
    return;
  }
  memoryGenerateInFlight = Math.max(0, memoryGenerateInFlight - 1);
}
