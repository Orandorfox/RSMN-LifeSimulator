"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "life-sim-participant";

/** 登录成功后保存在内存 + sessionStorage 的被试信息 */
export type Participant = {
  name: string;
  id: string;
  group: string;
  token: string;
};

type ExperimentContextValue = {
  participant: Participant | null;
  setParticipant: (p: Participant | null) => void;
  /** 从 sessionStorage 恢复（实验页挂载时调用） */
  hydrateFromStorage: () => void;
};

const ExperimentContext = createContext<ExperimentContextValue | null>(null);

export function ExperimentProvider({ children }: { children: ReactNode }) {
  const [participant, setParticipantState] = useState<Participant | null>(
    null,
  );

  const setParticipant = useCallback((p: Participant | null) => {
    setParticipantState(p);
    if (typeof window === "undefined") return;
    if (p) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const hydrateFromStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Participant;
      if (parsed?.name && parsed?.id && parsed?.group && parsed?.token) {
        setParticipantState(parsed);
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo(
    () => ({ participant, setParticipant, hydrateFromStorage }),
    [participant, setParticipant, hydrateFromStorage],
  );

  return (
    <ExperimentContext.Provider value={value}>
      {children}
    </ExperimentContext.Provider>
  );
}

export function useExperiment() {
  const ctx = useContext(ExperimentContext);
  if (!ctx) {
    throw new Error("useExperiment 必须在 ExperimentProvider 内使用");
  }
  return ctx;
}
