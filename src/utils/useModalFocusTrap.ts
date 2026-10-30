import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * Move o foco para dentro do modal ativo, aprisiona navegação Tab / Shift+Tab
 * estritamente nos controles internos e restaura o foco anterior ao fechar.
 */
export function useModalFocusTrap(
  isActive: boolean,
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!isActive || typeof document === "undefined") return;

    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusInitial = () => {
      const preferred = initialFocusRef?.current;
      if (
        preferred &&
        container.contains(preferred) &&
        !preferred.hasAttribute("disabled")
      ) {
        preferred.focus();
        return;
      }
      const focusables = getFocusableElements(container);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    };

    focusInitial();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const activeContainer = containerRef.current;
      if (!activeContainer) return;

      const focusables = getFocusableElements(activeContainer);
      if (focusables.length === 0) {
        e.preventDefault();
        activeContainer.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (!current || !activeContainer.contains(current)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const activeContainer = containerRef.current;
      if (!activeContainer) return;
      const target = e.target as Node | null;
      if (target && !activeContainer.contains(target)) {
        const focusables = getFocusableElements(activeContainer);
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          activeContainer.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [isActive, containerRef, initialFocusRef]);
}
