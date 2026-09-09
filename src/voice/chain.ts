/**
 * The speech provider chain. Terminates in a tier that cannot be exhausted, and
 * a degrade is announced. Generic over the work, so both directions share it.
 */
export type ProviderName = "elevenlabs" | "fishaudio" | "browser";

export interface Attempt<T> {
  provider: ProviderName;
  run: () => Promise<T>;
}

export interface ChainResult<T> {
  value: T;
  provider: ProviderName;
  /** Providers that failed before this one, in order, with why. */
  failures: { provider: ProviderName; reason: string }[];
  /** True when the answer did not come from the first choice. */
  degraded: boolean;
}

export class ChainExhaustedError extends Error {
  // A plain field, not a parameter property: Node's strip-only TypeScript mode
  // rejects those, and the server runs under it.
  readonly failures: { provider: ProviderName; reason: string }[];

  constructor(failures: { provider: ProviderName; reason: string }[]) {
    super(
      `every speech provider failed: ${failures
        .map((failure) => `${failure.provider} (${failure.reason})`)
        .join(", ")}`,
    );
    this.failures = failures;
    this.name = "ChainExhaustedError";
  }
}

export async function runChain<T>(attempts: Attempt<T>[]): Promise<ChainResult<T>> {
  const failures: { provider: ProviderName; reason: string }[] = [];

  for (const attempt of attempts) {
    try {
      const value = await attempt.run();
      return { value, provider: attempt.provider, failures, degraded: failures.length > 0 };
    } catch (error) {
      failures.push({
        provider: attempt.provider,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw new ChainExhaustedError(failures);
}

const VOICE_NAME: Record<ProviderName, string> = {
  elevenlabs: "the usual voice",
  fishaudio: "a different voice",
  browser: "your device's own voice",
};

/** Told, not hidden. */
export function degradeNotice(result: ChainResult<unknown>): string | null {
  if (!result.degraded) return null;
  return `The usual voice was unavailable, so this is being read by ${VOICE_NAME[result.provider]}.`;
}
