"use client";

import { createContext, useContext } from "react";
import type { TerminologyPack, TermKey } from "../../config/terminology";

const TerminologyContext = createContext<TerminologyPack | null>(null);

export function TerminologyProvider({
  pack,
  children
}: Readonly<{
  pack: TerminologyPack;
  children: React.ReactNode;
}>) {
  return <TerminologyContext.Provider value={pack}>{children}</TerminologyContext.Provider>;
}

export function useTerm(key: TermKey) {
  const pack = useContext(TerminologyContext);

  if (!pack) {
    throw new Error("TerminologyProvider is required before useTerm.");
  }

  return pack[key];
}
