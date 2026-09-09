import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LIMITS, askRequest, callbackRequest, feedbackRequest, loginRequest, loginVerify, speakRequest } from "../../src/validate.ts";

const REASONS = ["wrong_plan", "not_what_i_asked", "hard_to_understand", "think_it_is_covered"] as const;

describe("malformed input never reaches a handler [FR-P3-84]", () => {
  for (const [name, parse] of [
    ["ask", askRequest],
    ["callback", callbackRequest],
    ["login", loginRequest],
    ["verify", loginVerify],
    ["speak", speakRequest],
  ] as const) {
    it(`rejects a body that is not JSON: ${name}`, () => {
      expect(parse("not json")).toBeNull();
      expect(parse("")).toBeNull();
    });

    // A bare array or string parses as JSON but has no fields to read.
    it(`rejects JSON that is not an object: ${name}`, () => {
      expect(parse("[1,2]")).toBeNull();
      expect(parse('"a string"')).toBeNull();
      expect(parse("null")).toBeNull();
    });
  }
});

describe("every field is coerced or dropped [FR-P3-84]", () => {
  it("takes a question and trims it", () => {
    expect(askRequest('{"question":"  what is my copay  "}')?.question).toBe("what is my copay");
  });

  it("drops a question that is not a string", () => {
    expect(askRequest('{"question":42}')?.question).toBe("");
    expect(askRequest('{"question":{"$ne":null}}')?.question).toBe("");
  });

  it("keeps only a language it offers", () => {
    expect(askRequest('{"question":"q","language":"es"}')?.language).toBe("es");
    expect(askRequest('{"question":"q","language":"fr"}')?.language).toBe("en");
    expect(askRequest('{"question":"q"}')?.language).toBe("en");
  });

  it("keeps plan and contract as null when absent or wrong", () => {
    const none = askRequest('{"question":"q","planId":7,"contractId":[]}');
    expect(none?.planId).toBeNull();
    expect(none?.contractId).toBeNull();
  });

  it("accepts a feedback reason only from the list it is given", () => {
    expect(feedbackRequest('{"turnId":"t","resolved":false,"reason":"wrong_plan"}', REASONS)?.reason).toBe("wrong_plan");
    expect(feedbackRequest('{"turnId":"t","resolved":false,"reason":"anything else"}', REASONS)?.reason).toBeNull();
  });

  it("keeps resolved null unless it is a real boolean", () => {
    expect(feedbackRequest('{"turnId":"t","resolved":true}', REASONS)?.resolved).toBe(true);
    expect(feedbackRequest('{"turnId":"t","resolved":"true"}', REASONS)?.resolved).toBeNull();
  });

  it("keeps only the strings out of a list", () => {
    const request = callbackRequest('{"question":"q","documentsSearched":["a",3,null,"b"]}');
    expect(request?.documentsSearched).toEqual(["a", "b"]);
  });

  it("drops a documentsSearched that is not a list", () => {
    expect(callbackRequest('{"question":"q","documentsSearched":"a"}')?.documentsSearched).toEqual([]);
  });
});

describe("every ceiling holds [FR-P3-85]", () => {
  const long = (n: number): string => "a".repeat(n);

  it("truncates a question", () => {
    const request = askRequest(JSON.stringify({ question: long(5_000) }));
    expect(request?.question).toHaveLength(LIMITS.question);
  });

  it("truncates a note", () => {
    const request = callbackRequest(JSON.stringify({ question: "q", note: long(9_000) }));
    expect(request?.note).toHaveLength(LIMITS.note);
  });

  it("truncates an email and a code", () => {
    const request = loginVerify(JSON.stringify({ email: long(900), code: long(900) }));
    expect(request?.email).toHaveLength(LIMITS.email);
    expect(request?.code).toHaveLength(LIMITS.code);
  });

  it("truncates the text sent for synthesis", () => {
    const request = speakRequest(JSON.stringify({ text: long(50_000) }));
    expect(request?.text).toHaveLength(LIMITS.speakText);
  });

  // The body ceiling is enforced while reading, before any of this runs.
  it("states a body and an audio ceiling", () => {
    expect(LIMITS.body).toBeGreaterThan(0);
    expect(LIMITS.audioBytes).toBeGreaterThan(0);
  });
});

describe("the boundary is one module, not per handler [FR-P3-84]", () => {
  const server = readFileSync("src/server.ts", "utf8");

  it("leaves no JSON.parse in a handler", () => {
    expect(server).not.toMatch(/JSON\.parse\(body\)/);
  });

  it("reads every body through the shared ceiling", () => {
    expect(server).toMatch(/LIMITS\.body/);
    expect(server).toMatch(/LIMITS\.audioBytes/);
  });
});

describe("cookies [FR-P3-86]", () => {
  const server = readFileSync("src/server.ts", "utf8");

  // One helper builds the flags, so the two cookies cannot drift apart.
  it("are HttpOnly and SameSite through one shared helper", () => {
    expect(server).toMatch(/const cookieFlags[\s\S]{0,160}HttpOnly; SameSite=Lax/);
    const uses = server.match(/cookieFlags\(req\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });

  // Derived from the forwarded protocol, so production sets it and a local
  // plaintext port does not, with nothing to configure.
  it("carry Secure only when the connection arrived over https", () => {
    expect(server).toMatch(/x-forwarded-proto/);
    expect(server).toMatch(/Secure/);
  });
});

describe("the served page's policy [FR-P3-87]", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    headers: { headers: { key: string; value: string }[] }[];
  };
  const header = (key: string): string =>
    vercel.headers[0]?.headers.find((entry) => entry.key === key)?.value ?? "";
  const csp = header("Content-Security-Policy");

  it("permits only same-origin sources", () => {
    for (const directive of ["default-src 'self'", "script-src 'self'", "connect-src 'self'"]) {
      expect(csp, directive).toContain(directive);
    }
  });

  // Synthesised speech is played from a blob URL, so media needs it and nothing else does.
  it("allows blob media and nothing wider", () => {
    expect(csp).toContain("media-src 'self' blob:");
    expect(csp).not.toMatch(/script-src[^;]*(unsafe-eval|unsafe-inline|\*)/);
  });

  it("forbids framing and plugins outright", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("keeps the headers that were already there", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("X-Frame-Options")).toBe("DENY");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});

describe("dependency advisories [FR-P3-89]", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");

  it("fails the build on a critical advisory", () => {
    expect(ci).toMatch(/npm audit --audit-level=critical/);
  });

  // A gate that can never pass gets ignored, so highs warn and are documented.
  it("reports highs without blocking", () => {
    expect(ci).toMatch(/npm audit --audit-level=high \|\| echo/);
  });

  it("points at where the open ones are recorded", () => {
    expect(ci).toContain("docs/security.md");
  });
});
