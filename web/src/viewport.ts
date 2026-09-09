import { useEffect, useState } from "react";

/**
 * Below this the panel is not offered: a floating panel over a 393px page is a
 * smaller reading surface for no gain, so the launcher opens the full page.
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
