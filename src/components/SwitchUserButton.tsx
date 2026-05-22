import { LogOut } from "lucide-react";
import { useRole } from "@/lib/role";
import { useNavigate } from "@tanstack/react-router";

export function SwitchUserButton({ compact = false }: { compact?: boolean }) {
  const { role, logout } = useRole();
  const navigate = useNavigate();

  return (
    <button
      onClick={() => {
        // Pre-select the *other* role on the login page so a one-tap switch works.
        const next = role === "foreman" ? "supervisor" : "foreman";
        logout();
        navigate({ to: "/login", search: { as: next } });
      }}
      aria-label="Switch user"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 text-xs font-medium hover:bg-accent transition-colors ${
        compact ? "h-9" : "h-10"
      }`}
    >
      <LogOut className="size-4" />
      <span className="hidden sm:inline">Switch user</span>
    </button>
  );
}
