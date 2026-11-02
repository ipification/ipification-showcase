"use client";
import { useEffect, useState } from "react";

/** Showcase-only browser presentation; no authentication requests live here. */
export function useShowcaseBrowser(
  defaultCountry: string | undefined,
  appEnv: string,
) {
  const [country, setCountry] = useState(defaultCountry || "rs");
  const [mobile, setMobile] = useState(false);
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (
        event.key !== "Tab" &&
        event.target instanceof HTMLElement &&
        (event.target.matches("input, textarea") ||
          event.target.isContentEditable)
      )
        return;
      if (
        [
          "Tab",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(event.key)
      )
        setKeyboardNavigation(true);
    };
    const pointer = () => setKeyboardNavigation(false);
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", pointer, true);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("pointerdown", pointer, true);
    };
  }, []);

  useEffect(() => {
    const resize = () =>
      setMobile(
        window.innerWidth <= 768 ||
          /Android|iPhone|Mobile/i.test(navigator.userAgent),
      );
    resize();
    window.addEventListener("resize", resize);
    if (!defaultCountry && appEnv !== "stage") {
      fetch("/api/geoip")
        .then((response) => response.json())
        .then((data) => setCountry(data.country || "rs"))
        .catch(() => {});
    }
    return () => window.removeEventListener("resize", resize);
  }, [defaultCountry, appEnv]);

  return { country, mobile, keyboardNavigation };
}
