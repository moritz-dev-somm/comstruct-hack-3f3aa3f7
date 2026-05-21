import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HardHat, ClipboardList } from "lucide-react";
import { useRole } from "@/lib/role";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — comstruct" },
      { name: "description", content: "Choose your role to continue." },
    ],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { setRole } = useRole();

  function pick(role: "foreman" | "supervisor") {
    setRole(role);
    navigate({ to: role === "foreman" ? "/" : "/procurement" });
  }

  return (
    <div className="min-h-screen bg-muted/30 text-foreground flex flex-col">
      <header className="px-6 h-14 flex items-center gap-2">
        <div className="size-8 rounded-md bg-brand text-brand-foreground grid place-items-center">
          <HardHat className="size-5" />
        </div>
        <span className="font-semibold text-sm">comstruct</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-2xl text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Who's signing in?
          </h1>
          <p className="mt-2 text-muted-foreground">
            Pick a role to continue. You can switch anytime.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <RoleCard
              icon={<HardHat className="size-7" />}
              title="Foreman"
              subtitle="Order materials from the site in plain language."
              onClick={() => pick("foreman")}
            />
            <RoleCard
              icon={<ClipboardList className="size-7" />}
              title="Supervisor"
              subtitle="Approvals, orders, analytics and catalog."
              onClick={() => pick("supervisor")}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function RoleCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border bg-card p-6 shadow-sm hover:border-brand hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="size-12 rounded-lg bg-brand/10 text-brand grid place-items-center group-hover:bg-brand group-hover:text-brand-foreground transition-colors">
        {icon}
      </div>
      <div className="mt-4 text-lg font-semibold">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
    </button>
  );
}
