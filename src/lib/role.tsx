import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "foreman" | "supervisor" | null;

type RoleCtx = {
  role: Role;
  setRole: (r: Exclude<Role, null>) => void;
  logout: () => void;
};

const Ctx = createContext<RoleCtx | null>(null);
const KEY = "comstruct-role";

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(KEY);
    return v === "foreman" || v === "supervisor" ? v : null;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (role) localStorage.setItem(KEY, role);
    else localStorage.removeItem(KEY);
  }, [role]);

  return (
    <Ctx.Provider
      value={{
        role,
        setRole: (r) => setRoleState(r),
        logout: () => setRoleState(null),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useRole() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRole outside RoleProvider");
  return c;
}
