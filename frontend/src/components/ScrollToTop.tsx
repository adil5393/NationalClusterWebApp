import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

/** React Router doesn't reset scroll on navigation the way a full page load
 * does — without this, clicking a link while scrolled down (e.g. a team card
 * near the bottom of /teams) lands on the new page still scrolled down. */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
