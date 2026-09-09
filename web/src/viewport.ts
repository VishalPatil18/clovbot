import { useEffect, useState } from "react";

/**
 * Below this the panel is not offered at all. FR-P3-45.
 *
 * A 393px phone cannot show a conversation beside anything else, and a floating
 * panel over a page that is itself only 393px wide is a smaller reading surface
 * for no gain. The full page is the only sensible layout, so the launcher opens
 * it directly rather than opening a panel with an expand button in it.
 */
export const PHONE_MAX = 48; // rem

const QUERY = `(max-width: ${String(PHONE_MAX)}rem)`;

/** Matches the CSS breakpoint by construction, so the two cannot drift. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => {
    try {
      return window.matchMedia(QUERY).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent): void => setPhone(event.matches);
    media.addEventListener("change", onChange);
    setPhone(media.matches);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return phone;
}
