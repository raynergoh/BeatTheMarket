"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface PrivacyContextType {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("btm_privacy_mode");
    if (stored) {
      setIsPrivacyMode(stored === "true");
    }
  }, []);

  const togglePrivacyMode = () => {
    setIsPrivacyMode((prev) => {
      const next = !prev;
      localStorage.setItem("btm_privacy_mode", String(next));
      return next;
    });
  };

  // Prevent hydration mismatch by rendering children without context first, but we want it available right away.
  // We can just return it. If it mismatches, it mismatches.
  // Since we rely on localStorage, it will always mismatch if true.
  // But we can render children anyway.

  return (
    <PrivacyContext.Provider value={{ isPrivacyMode: mounted ? isPrivacyMode : false, togglePrivacyMode }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  const context = useContext(PrivacyContext);
  if (context === undefined) {
    throw new Error("usePrivacy must be used within a PrivacyProvider");
  }
  return context;
}
