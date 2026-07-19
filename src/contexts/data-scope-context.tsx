import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";

export type DataScope = "mine" | "all" | string; // string for admin selecting specific user

interface DataScopeContextValue {
  scope: DataScope;
  setScope: (scope: DataScope) => void;
  isAdmin: boolean;
  currentUserId: string | null;
  effectiveUserId: string | null; // The user ID to filter by (null = all data)
}

const DataScopeContext = createContext<DataScopeContextValue | undefined>(undefined);

export function DataScopeProvider({ children }: { children: ReactNode }) {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.isAdmin ?? false;
  const currentUserId = me?.user?.id ?? null;

  // Load saved preference from localStorage
  const [scope, setScopeState] = useState<DataScope>(() => {
    const saved = localStorage.getItem("dataScope");
    return saved ?? "all"; // Default to "all"
  });

  // Persist scope changes
  const setScope = (newScope: DataScope) => {
    setScopeState(newScope);
    localStorage.setItem("dataScope", newScope);
  };

  // Reset to "mine" if non-admin tries to use admin-only features (specific user filter)
  useEffect(() => {
    if (!isAdmin && scope !== "mine" && scope !== "all") {
      setScope("mine");
    }
  }, [isAdmin, scope]);

  // Calculate the effective user ID for filtering
  const effectiveUserId =
    scope === "all"
      ? null
      : scope === "mine"
      ? currentUserId
      : scope; // admin selected a specific user ID

  return (
    <DataScopeContext.Provider
      value={{
        scope,
        setScope,
        isAdmin,
        currentUserId,
        effectiveUserId,
      }}
    >
      {children}
    </DataScopeContext.Provider>
  );
}

export function useDataScope() {
  const context = useContext(DataScopeContext);
  if (!context) {
    throw new Error("useDataScope must be used within DataScopeProvider");
  }
  return context;
}
