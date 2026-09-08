import { useEffect, useRef, useState } from "react";
import { Assistant } from "./components/Assistant.tsx";
import { Landing } from "./components/Landing.tsx";

type Route = "home" | "assistant";

const readRoute = (): Route => (window.location.pathname === "/assistant" ? "assistant" : "home");

export function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>(readRoute);
  const [panelOpen, setPanelOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPop = (): void => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (next: Route): void => {
    window.history.pushState({}, "", next === "assistant" ? "/assistant" : "/");
    setRoute(next);
  };

  // Escape closes the panel and returns focus to the control that opened it,
  // so keyboard users are never stranded. NFR-A11Y-04.
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setPanelOpen(false);
      launcher.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  useEffect(() => {
    if (panelOpen) panel.current?.focus();
  }, [panelOpen]);

  if (route === "assistant") {
    return (
      <>
        <Disclaimer />
        <main className="page" id="main">
          <a className="button button--quiet" href="/" onClick={(e) => { e.preventDefault(); go("home"); }}>
            Back to the plan page
          </a>
          <Assistant variant="page" />
        </main>
      </>
    );
  }

  return (
    <>
      <Landing onAsk={() => setPanelOpen(true)} />

      {/* FR-12: launcher bottom right; panel 40% of viewport, full width on mobile. */}
      <button
        ref={launcher}
        type="button"
        className="launcher"
        aria-expanded={panelOpen}
        aria-controls="assistant-panel"
        onClick={() => setPanelOpen((open) => !open)}
      >
        {panelOpen ? "Close the assistant" : "Ask the assistant"}
      </button>

      {panelOpen && (
        <div
          id="assistant-panel"
          className="panel"
          role="dialog"
          aria-modal="false"
          aria-label="Member assistant"
          tabIndex={-1}
          ref={panel}
        >
          <Assistant
            variant="panel"
            onExpand={() => { setPanelOpen(false); go("assistant"); }}
            onClose={() => { setPanelOpen(false); launcher.current?.focus(); }}
          />
        </div>
      )}
    </>
  );
}

/** FR-30. Persistent, on every route. */
function Disclaimer(): React.JSX.Element {
  return (
    <p className="disclaimer" role="note">
      Unaffiliated case study. Not operated by or endorsed by Clover Health. Contact details are
      placeholders.
    </p>
  );
}
