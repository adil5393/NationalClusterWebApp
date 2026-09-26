import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

/** React Router doesn't reset scroll on navigation the way a full page load
 * does — without this, clicking a link while scrolled down (e.g. a team card
 * near the bottom of /teams) lands on the new page still scrolled down.
 *
 * A URL with a hash (e.g. /accommodation#campus, where the old /campus URL
 * now forwards) scrolls to that element instead. Pages load lazily and fetch
 * their content, so the target may not exist yet — keep looking for a few
 * seconds before giving up (the page is already at the top by then). */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        clearInterval(timer);
      } else if (++tries > 30) {
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [pathname, hash]);

  return null;
}
