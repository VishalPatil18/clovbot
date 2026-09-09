import { redactIdentifiers } from "../logging.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface Delivery {
  delivered: boolean;
  /** Safe to log: never contains the code. */
  detail: string;
}

/**
 * Sends one code. It appears in the request body and nowhere else: not a log
 * line, not an error. Without a key it goes to the server log, and says so.
 */
export async function sendLoginCode(to: string, code: string): Promise<Delivery> {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["OTP_FROM_ADDRESS"];

  if (key === undefined || key.length === 0 || from === undefined || from.length === 0) {
    console.warn(`no mail credentials; code for ${redactIdentifiers(to)} written to this log only`);
    console.warn(`  development code: ${code}`);
    return { delivered: false, detail: "no mail credentials configured" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `${code} is your Clovbot sign-in code`,
        text: [
          `Your sign-in code is ${code}.`,
          "",
          "It works once and expires in 10 minutes.",
          "If you did not ask to sign in, ignore this message.",
          "",
          "Clovbot is an unaffiliated case study. It is not operated by or endorsed by Clover Health.",
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      // The body can echo the request, so only the status is recorded.
      return { delivered: false, detail: `mail provider returned ${String(response.status)}` };
    }
    return { delivered: true, detail: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { delivered: false, detail: `mail provider unreachable: ${redactIdentifiers(message)}` };
  }
}
