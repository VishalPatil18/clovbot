import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IoArrowBack, IoCall, IoChatbubbleEllipses, IoClose } from "react-icons/io5";
import { Assistant, MEMBER_SERVICES_DISPLAY as MEMBER_SERVICES } from "./components/Assistant.tsx";
import { Landing } from "./components/Landing.tsx";

type Route = "home" | "assistant";

const readRoute = (): Route => (window.location.pathname === "/assistant" ? "assistant" : "home");

export function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>(readRoute);
  const [panelOpen, setPanelOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Held above the panel so a close never discards a half-typed question. D-076.
  const [draft, setDraft] = useState("");
  const reduceMotion = useReducedMotion();

  const closePanel = useCallback((): void => {
    setPanelOpen(false);
    launcher.current?.focus();
  }, []);

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
  /*
   * The panel dims and covers the page, so it holds focus while it is open.
   * A dialog that blocks the page visually must block it for the keyboard too,
   * or it is only a dialog for people using a mouse. D-075.
   */
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closePanel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panel.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable === undefined || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, closePanel]);

  /*
   * Both elements, not just body. `html, body { overflow-x: hidden }` makes the
   * other axis compute to auto, so the document element owns the scroll and
   * locking body alone leaves the page scrolling behind the backdrop.
   * Released on unmount, or the page stays frozen after a close.
   */
  useEffect(() => {
    if (!panelOpen) return;
    const root = document.documentElement;
    const previous = { root: root.style.overflow, body: document.body.style.overflow };
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous.root;
      document.body.style.overflow = previous.body;
    };
  }, [panelOpen]);

  useEffect(() => {
    if (panelOpen) panel.current?.focus();
  }, [panelOpen]);

  if (route === "assistant") {
    return (
      <div className="fullscreen">
        <Disclaimer />
        <div className="workspace">
          {/* The reference's sidebar carries an account, saved chats and an
              upgrade tier. None exist here, so it carries what does: the plan
              in force, the actions, and the way to reach a person. */}
          <aside className="rail" aria-label="Assistant tools">
            <a
              className="rail__back"
              href="/"
              onClick={(e) => { e.preventDefault(); go("home"); }}
            >
              <IoArrowBack aria-hidden="true" /> Back
            </a>
            <div id="rail-slot" />
            {/* FR-13. The human path as its own card, not a line of small print. */}
            <div className="rail__human">
              <p className="rail__hours">
                <span className="rail__live">Live</span>
                <span>8am to 8pm, 7 days</span>
              </p>
              <p className="rail__human-copy">A person can pick this up whenever you want one.</p>
              <a className="rail__call" href={`tel:${MEMBER_SERVICES}`}>
                <IoCall aria-hidden="true" /> Talk to a person
              </a>
              <p className="rail__tty">{MEMBER_SERVICES} · TTY 711</p>
            </div>
          </aside>
          <main className="page" id="main">
            <Assistant variant="page" railId="rail-slot" />
          </main>
        </div>
      </div>
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
        {panelOpen ? (
          <>
            <IoClose aria-hidden="true" /> Close the assistant
          </>
        ) : (
          <>
            <IoChatbubbleEllipses aria-hidden="true" /> Ask the assistant
          </>
        )}
      </button>

      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div
              className="backdrop"
              onClick={closePanel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion === true ? 0 : 0.2 }}
            />
            <motion.div
              id="assistant-panel"
              className="panel"
              role="dialog"
              aria-modal="true"
              aria-label="Member assistant"
              tabIndex={-1}
              ref={panel}
              initial={reduceMotion === true ? { opacity: 0 } : { x: "100%" }}
              animate={reduceMotion === true ? { opacity: 1 } : { x: 0 }}
              exit={reduceMotion === true ? { opacity: 0 } : { x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <Assistant
                variant="panel"
                draft={draft}
                onDraftChange={setDraft}
                onExpand={() => { setPanelOpen(false); go("assistant"); }}
                onClose={closePanel}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
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
