"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type FloatingDockContextValue = {
  messagesExpanded: boolean;
  setMessagesExpanded: (expanded: boolean) => void;
  inputFocused: boolean;
  modalOpen: boolean;
};

const FloatingDockContext = createContext<FloatingDockContextValue | null>(null);

export function FloatingDockProvider({ children }: { children: ReactNode }) {
  const [messagesExpanded, setMessagesExpanded] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(
        target.closest('input:not([type="hidden"]), textarea, select, [contenteditable="true"]')
      );
    };

    const handleFocusIn = (event: FocusEvent) => {
      setInputFocused(isEditableTarget(event.target));
    };

    const handleFocusOut = () => {
      window.setTimeout(() => {
        setInputFocused(isEditableTarget(document.activeElement));
      }, 0);
    };

    const refreshModalState = () => {
      setModalOpen(
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
        ) !== null
      );
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    refreshModalState();

    const observer = new MutationObserver(refreshModalState);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "role", "open"],
    });

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      observer.disconnect();
    };
  }, []);

  const value = useMemo(
    () => ({
      messagesExpanded,
      setMessagesExpanded,
      inputFocused,
      modalOpen,
    }),
    [messagesExpanded, inputFocused, modalOpen]
  );

  return (
    <FloatingDockContext.Provider value={value}>{children}</FloatingDockContext.Provider>
  );
}

export function useFloatingDock() {
  const ctx = useContext(FloatingDockContext);
  if (!ctx) {
    throw new Error("useFloatingDock must be used within FloatingDockProvider");
  }
  return ctx;
}

export function useOptionalFloatingDock() {
  return useContext(FloatingDockContext);
}

export function useRegisterMessagesExpanded(expanded: boolean) {
  const ctx = useOptionalFloatingDock();
  const setMessagesExpanded = ctx?.setMessagesExpanded;

  useEffect(() => {
    setMessagesExpanded?.(expanded);
    return () => setMessagesExpanded?.(false);
  }, [expanded, setMessagesExpanded]);
}
