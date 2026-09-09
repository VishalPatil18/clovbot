import { useState } from "react";
import { requestCallback, type CallbackDraft } from "../api.ts";
import { MEMBER_SERVICES_DISPLAY } from "./Assistant.tsx";

/**
 * A refusal shows what was searched and offers a pre-filled callback. The form
 * collects no name, phone or email, so there is nothing here to leak.
 */
export function CallbackPanel({ draft }: { draft: CallbackDraft }): React.JSX.Element {
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sending, setSending] = useState(false);

  if (result?.ok === true) {
    return (
      <div className="callback callback--done" role="status">
        <h4 className="callback__title">Request saved</h4>
        <p>{result.message}</p>
        <p className="callback__note">
          Nothing is sent anywhere in this case study. You can still call {MEMBER_SERVICES_DISPLAY}.
        </p>
      </div>
    );
  }

  return (
    <form
      className="callback"
      onSubmit={(event) => {
        event.preventDefault();
        setSending(true);
        void requestCallback(draft, note)
          .then(setResult)
          .finally(() => setSending(false));
      }}
    >
      <h4 className="callback__title">Ask a person to pick this up</h4>
      <p>This goes over with your question and what was already searched, so you do not repeat yourself.</p>

      <dl className="callback__prefill">
        <dt>Your question</dt>
        <dd>{draft.question}</dd>
        <dt>Plan</dt>
        <dd>{draft.planName}</dd>
        <dt>Documents searched</dt>
        <dd>
          {draft.documentsSearched.length === 0
            ? "None yet"
            : draft.documentsSearched.join(", ")}
        </dd>
      </dl>

      <label className="callback__label" htmlFor="callback-note">
        Anything else to add (optional)
      </label>
      <textarea
        id="callback-note"
        className="callback__note-input"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        maxLength={1000}
      />

      {result?.ok === false && (
        <p className="callback__error" role="alert">
          {result.message}
        </p>
      )}

      <div className="callback__actions">
        <button type="submit" className="button button--primary" disabled={sending}>
          {sending ? "Saving" : "Request a call"}
        </button>
        <a className="button button--quiet" href={`tel:${MEMBER_SERVICES_DISPLAY}`}>
          Call {MEMBER_SERVICES_DISPLAY}
        </a>
      </div>
    </form>
  );
}
