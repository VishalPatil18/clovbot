import { describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { audioKey, audioPath, findCachedAudio } from "../../src/voice/cache.ts";
import {
  ChainExhaustedError,
  degradeNotice,
  runChain,
  type Attempt,
} from "../../src/voice/chain.ts";

const ok = (provider: Attempt<string>["provider"], value: string): Attempt<string> => ({
  provider,
  run: vi.fn(async () => value),
});

const fails = (provider: Attempt<string>["provider"], reason: string): Attempt<string> => ({
  provider,
  run: vi.fn(async () => {
    throw new Error(reason);
  }),
});

describe("provider chain [FR-20]", () => {
  it("uses the first provider when it works", async () => {
    const second = ok("fishaudio", "b");
    const result = await runChain([ok("elevenlabs", "a"), second]);
    expect(result.value).toBe("a");
    expect(result.provider).toBe("elevenlabs");
    expect(second.run).not.toHaveBeenCalled();
  });

  it("does not report a degrade when the first provider answers", async () => {
    const result = await runChain([ok("elevenlabs", "a")]);
    expect(result.degraded).toBe(false);
    expect(degradeNotice(result)).toBeNull();
  });

  it("falls through to the next provider", async () => {
    const result = await runChain([fails("elevenlabs", "429"), ok("fishaudio", "b")]);
    expect(result.value).toBe("b");
    expect(result.provider).toBe("fishaudio");
    expect(result.degraded).toBe(true);
  });

  // The tier that cannot be exhausted. This is the case that proves the chain
  // terminates somewhere safe rather than failing the member.
  it("reaches the browser synthesiser when both remote providers fail", async () => {
    const result = await runChain([
      fails("elevenlabs", "no credits"),
      fails("fishaudio", "timeout"),
      ok("browser", "native"),
    ]);
    expect(result.provider).toBe("browser");
    expect(result.failures.map((failure) => failure.provider)).toEqual(["elevenlabs", "fishaudio"]);
  });

  it("records why each provider failed, in order", async () => {
    const result = await runChain([
      fails("elevenlabs", "429 rate limited"),
      fails("fishaudio", "socket hang up"),
      ok("browser", "native"),
    ]);
    expect(result.failures).toEqual([
      { provider: "elevenlabs", reason: "429 rate limited" },
      { provider: "fishaudio", reason: "socket hang up" },
    ]);
  });

  it("throws with every reason when nothing succeeds", async () => {
    await expect(
      runChain([fails("elevenlabs", "a"), fails("fishaudio", "b")]),
    ).rejects.toBeInstanceOf(ChainExhaustedError);
  });

  it("names every failed provider in the error, so the cause is diagnosable", async () => {
    let message = "";
    try {
      await runChain([fails("elevenlabs", "a"), fails("fishaudio", "b")]);
    } catch (caught) {
      message = caught instanceof Error ? caught.message : String(caught);
    }
    expect(message).toContain("elevenlabs");
    expect(message).toContain("fishaudio");
  });
});

describe("degrade notice [FR-20]", () => {
  it("tells the member the voice changed rather than leaving them to wonder", async () => {
    const result = await runChain([fails("elevenlabs", "x"), ok("fishaudio", "b")]);
    expect(degradeNotice(result)).toMatch(/different voice/i);
  });

  it("names the device's own voice when the chain reaches the browser", async () => {
    const result = await runChain([
      fails("elevenlabs", "x"),
      fails("fishaudio", "y"),
      ok("browser", "n"),
    ]);
    expect(degradeNotice(result)).toMatch(/your device's own voice/i);
  });
});

describe("audio cache key [FR-20]", () => {
  it("is stable for the same text, voice and provider", () => {
    expect(audioKey("hello", "v1", "elevenlabs")).toBe(audioKey("hello", "v1", "elevenlabs"));
  });

  it("differs when the text differs", () => {
    expect(audioKey("hello", "v1", "elevenlabs")).not.toBe(audioKey("hello there", "v1", "elevenlabs"));
  });

  // The same words in another voice are a different recording.
  it("differs when the voice differs", () => {
    expect(audioKey("hello", "v1", "elevenlabs")).not.toBe(audioKey("hello", "v2", "elevenlabs"));
  });

  // Serving yesterday's provider after a fall-through would be a silent swap.
  it("differs when the provider differs", () => {
    expect(audioKey("hello", "v1", "elevenlabs")).not.toBe(audioKey("hello", "v1", "fishaudio"));
  });

  it("produces a filesystem-safe path", () => {
    expect(audioPath(audioKey("hello", "v1", "elevenlabs"))).toMatch(/^data\/audio\/[0-9a-f]{64}\.mp3$/);
  });
});

// A recording made while the chain was degraded is still a valid recording of
// the same words. Checking only the primary key would miss it and, worse, would
// report the wrong provider for the one it did find.
describe("cache lookup across the chain", () => {
  const text = `cache-test-${Math.random()}`;
  const chain = ["elevenlabs", "fishaudio"] as const;
  const fallbackPath = audioPath(audioKey(text, "v1", "fishaudio"));

  it("finds a recording stored by the fallback provider", () => {
    mkdirSync("data/audio", { recursive: true });
    writeFileSync(fallbackPath, Buffer.from([1, 2, 3]));
    try {
      const found = findCachedAudio(text, "v1", chain);
      expect(found?.provider).toBe("fishaudio");
      expect(found?.audio.byteLength).toBe(3);
    } finally {
      rmSync(fallbackPath, { force: true });
    }
  });

  it("returns nothing when no provider has it", () => {
    expect(findCachedAudio(`missing-${Math.random()}`, "v1", chain)).toBeNull();
  });
});
