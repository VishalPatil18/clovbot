import { useState } from "react";
import {
  IoAlertCircleOutline,
  IoClose,
  IoLockClosedOutline,
  IoMailOutline,
} from "react-icons/io5";
import { requestLoginCode, verifyLoginCode } from "../api.ts";

interface Props {
  onSignedIn: (name: string) => void;
  onCancel: () => void;
}

/**
 * Inside the panel, so the conversation survives. Two steps, one field each:
 * both on one screen invites filling the second before it is possible.
 */
export function SignIn({ onSignedIn, onCancel }: Props): React.JSX.Element {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const askForCode = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const result = await requestLoginCode(email);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? null);
      return;
    }
    setStep("code");
    setNotice("If that address is on file, a six-digit code is on its way. It lasts 10 minutes.");
  };

  const submitCode = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const result = await verifyLoginCode(email, code);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? null);
      return;
    }
    onSignedIn(result.signedInAs ?? "your account");
  };

  return (
    <section className="signin" aria-label="Sign in">
      <div className="signin__head">
        <h3 className="signin__title">
          <IoLockClosedOutline aria-hidden="true" /> Sign in to see your own details
        </h3>
        {/* The one dismissal that exists on both steps. */}
        <button type="button" className="assistant__icon-button" onClick={onCancel}>
          <IoClose aria-hidden="true" />
          <span className="visually-hidden">Close sign in</span>
        </button>
      </div>
      <p className="signin__body">
        We email you a six-digit code. There is no password to remember.
      </p>

      {step === "email" ? (
        <form
          className="signin__form"
          onSubmit={(event) => {
            event.preventDefault();
            void askForCode();
          }}
        >
          <label className="signin__label" htmlFor="signin-email">
            Your email address
          </label>
          <input
            id="signin-email"
            className="signin__input"
            type="email"
            value={email}
            autoComplete="email"
            required
            autoFocus
            onChange={(event) => setEmail(event.target.value)}
          />
          <div className="signin__actions">
            <button type="submit" className="button button--primary" disabled={busy}>
              <IoMailOutline aria-hidden="true" /> {busy ? "Sending" : "Email me a code"}
            </button>
            <button type="button" className="button button--quiet" onClick={onCancel}>
              Not now
            </button>
          </div>
        </form>
      ) : (
        <form
          className="signin__form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCode();
          }}
        >
          <label className="signin__label" htmlFor="signin-code">
            The six-digit code
          </label>
          {/* WCAG 3.3.8: pasteable, and the keypad opens on a phone. FR-P2-33. */}
          <input
            id="signin-code"
            className="signin__input signin__input--code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            maxLength={12}
            required
            autoFocus
            onChange={(event) => setCode(event.target.value)}
          />
          <div className="signin__actions">
            <button type="submit" className="button button--primary" disabled={busy}>
              {busy ? "Checking" : "Sign in"}
            </button>
            <button
              type="button"
              className="button button--quiet"
              disabled={busy}
              onClick={() => void askForCode()}
            >
              Send a new code
            </button>
          </div>
        </form>
      )}

      {notice !== null && error === null && (
        <p className="signin__notice" role="status">
          {notice}
        </p>
      )}
      {error !== null && (
        <p className="signin__error" role="alert">
          <IoAlertCircleOutline aria-hidden="true" />
          {error}
        </p>
      )}
    </section>
  );
}
