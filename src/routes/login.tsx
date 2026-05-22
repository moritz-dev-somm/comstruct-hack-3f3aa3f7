import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { HardHat, ClipboardList, Loader2, ArrowRight } from "lucide-react";
import { useRole, DEMO_USERS } from "@/lib/role";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import comstructLogo from "@/assets/comstruct-logo.png";
import {
  IconTile,
  BlueprintIcon,
  GearIcon,
  CompassIcon,
} from "@/components/construction-icons";

type Tab = "foreman" | "supervisor";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    as:
      search.as === "foreman" || search.as === "supervisor"
        ? (search.as as Tab)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — comstruct" },
      { name: "description", content: "Sign in to comstruct as foreman or supervisor." },
    ],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useRole();
  const { redirect, as } = Route.useSearch();

  const initial: Tab = as ?? "foreman";
  const [tab, setTab] = useState<Tab>(initial);
  const [username, setUsername] = useState(DEMO_USERS[initial].username);
  const [password, setPassword] = useState(DEMO_USERS[initial].password);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (as && as !== tab) setTab(as);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [as]);

  useEffect(() => {
    const u = DEMO_USERS[tab];
    setUsername(u.username);
    setPassword(u.password);
    setError(null);
  }, [tab]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    await new Promise((r) => setTimeout(r, 200));

    const result = signIn(username, password);
    if (!result.ok) {
      setError("Invalid username or password.");
      setSubmitting(false);
      return;
    }

    const dest = redirect ?? (result.role === "foreman" ? "/" : "/procurement");
    navigate({ to: dest });
  }

  const tabMeta: Record<Tab, { title: string; description: string; icon: React.ReactNode }> = {
    foreman: {
      title: "Foreman",
      description: "Order materials from the site in plain language.",
      icon: <HardHat className="size-4" />,
    },
    supervisor: {
      title: "Supervisor",
      description: "Review approvals, orders and the catalog.",
      icon: <ClipboardList className="size-4" />,
    },
  };

  const demo = DEMO_USERS[tab];

  return (
    <div className="min-h-screen bg-background text-foreground grid md:grid-cols-[1.1fr_1fr] lg:grid-cols-[1.25fr_1fr]">
      {/* ─── Brand panel ─────────────────────────────────────────── */}
      <aside
        className="relative bg-brand text-brand-foreground overflow-hidden flex flex-col p-8 md:p-12 lg:p-16 min-h-[260px] md:min-h-screen"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {/* Soft top-right halo */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 size-[480px] rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,255,255,0.18), transparent 70%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          <img
            src={comstructLogo}
            alt="comstruct"
            className="h-9 w-auto brightness-0 invert"
          />
        </div>

        <div className="relative mt-auto pt-12 md:pt-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-brand-foreground/70">
            Construction procurement
          </p>
          <h1 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-semibold leading-[1.05] tracking-tight max-w-[18ch]">
            Order C-materials in plain language.
          </h1>
          <p className="mt-4 text-sm md:text-base text-brand-foreground/75 max-w-[36ch]">
            One assistant for the whole site — from the first voice note to the
            delivery slip.
          </p>

          <ul className="mt-10 hidden md:flex flex-col gap-5 max-w-md">
            <FeatureRow
              icon={BlueprintIcon}
              title="Voice, scan, type"
              sub="Capture what the crew needs without slowing down."
            />
            <FeatureRow
              icon={GearIcon}
              title="AI supplier agent"
              sub="Negotiates, follows up and confirms delivery dates for you."
            />
            <FeatureRow
              icon={CompassIcon}
              title="Live order tracking"
              sub="From request to site — one timeline, no spreadsheets."
            />
          </ul>
        </div>

        <div className="relative mt-10 hidden md:flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-brand-foreground/60">
          <span>est. 2026 · Zürich</span>
          <span>v1.0</span>
        </div>
      </aside>

      {/* ─── Auth panel ─────────────────────────────────────────── */}
      <main className="dot-bg flex items-center justify-center px-5 py-10 md:py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Welcome back
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {tabMeta[tab].description}
            </p>
          </div>

          {/* Segmented role control */}
          <div
            role="tablist"
            aria-label="Role"
            className="relative grid grid-cols-2 rounded-full border bg-muted/50 p-1 mb-6"
          >
            {(["foreman", "supervisor"] as Tab[]).map((t) => {
              const active = tab === t;
              const meta = tabMeta[t];
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "relative z-10 inline-flex items-center justify-center gap-2 h-9 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors",
                    active
                      ? "bg-brand text-brand-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {meta.icon}
                  {meta.title}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label
                htmlFor="username"
                className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
              >
                Username
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                maxLength={100}
                required
                className="h-11 bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
              >
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                maxLength={200}
                required
                className="h-11 bg-background"
              />
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="group w-full h-11 text-sm font-semibold"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="size-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-brand" />
              Demo creds prefilled —
              <span className="font-mono text-foreground/80">
                {demo.username} / {demo.password}
              </span>
            </div>
          </div>

          <p className="mt-8 text-center text-[11px] text-muted-foreground">
            comstruct — construction procurement, simplified.
          </p>
        </div>
      </main>
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  title: string;
  sub: string;
}) {
  return (
    <li className="flex items-start gap-4">
      <IconTile
        icon={Icon as never}
        tone="light"
        size="sm"
        className="border-brand-foreground/15"
      />
      <div className="pt-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-brand-foreground/70 mt-0.5 max-w-[36ch]">
          {sub}
        </div>
      </div>
    </li>
  );
}
