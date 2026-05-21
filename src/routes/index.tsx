import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  Anchor,
  ArrowUp,
  Bolt,
  Building2,
  Check,
  ClipboardList,
  Clock,
  Droplets,
  Hammer,
  HardHat,
  Loader2,
  Package,
  Plus,
  Ruler,
  Search,
  SlidersHorizontal,
  ShoppingCart,
  X,
  Zap,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useRole } from "@/lib/role";
import { useProducts, formatEUR, type Product } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { useCheckoutDecision, type CheckoutDecision } from "@/lib/budget";
import { useOrders, tierFor, type ApprovalTier, TIER_THRESHOLDS, PM, CENTRAL } from "@/lib/orders";
import { VoiceButton } from "@/components/VoiceButton";
import { ScanButton } from "@/components/ScanButton";
import { ProductImage } from "@/components/ProductImage";
import { useServerFn } from "@tanstack/react-start";
import { startNegotiationForOrder } from "@/lib/supplier-agent.functions";
import chocolatesImg from "@/assets/chocolates-incentive.jpg";
import {
  IconTile,
  CompassIcon,
  GearIcon,
  ShovelIcon,
  CraneIcon,
  ConeIcon,
} from "@/components/construction-icons";

const CHOCOLATE_THRESHOLD = 500;

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "comstruct — order C-materials in plain language" },
      { name: "description", content: "Chat-first ordering for construction foremen. Describe the job, get the right screws, PPE and consumables." },
    ],
  }),
});

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
};

export type HybridExtracted = {
  extracted_category: string | null;
  extracted_keywords: string[];
  semantic_search_string: string;
};

export type HybridSearchResult = {
  sku: string;
  name: string;
  category: string;
  description: string | null;
  price_eur: number | string;
  unit: string;
  supplier: string | null;
  keywords: string[] | null;
  similarity: number;
  keyword_score: number;
  hybrid_score: number;
};

const SUGGESTED_CHIPS = [
  "I need screws to fix gypsum board to a metal stud",
  "PPE pack for a new worker starting tomorrow",
  "I need to seal around a window — what do I need?",
  "Standard drywall kit for ~50 m² wall",
  "Concrete drilling — bits, plugs, dust mask",
];

type CategoryTileData = {
  label: string;
  icon: LucideIcon;
  // Must match the `category` column in the products table exactly so
  // clicking a tile filters the catalog deterministically.
  category: string;
};

// Icon mapping by canonical category name. Unknown categories fall back to
// `Package`. Add new entries here when a category should get a custom glyph,
// but the tile list itself is derived from the products table at runtime.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Fasteners: Bolt,
  Safety: HardHat,
  "Safety / PPE": HardHat,
  PPE: HardHat,
  "Hand Tools": Hammer,
  "Power & Light": Zap,
  Power: Zap,
  Lighting: Zap,
  Sealing: Droplets,
  Adhesives: Droplets,
  Measuring: Ruler,
  Anchors: Anchor,
  Other: Package,
};

function iconForCategory(category: string): LucideIcon {
  return CATEGORY_ICONS[category] ?? Package;
}

function labelForCategory(category: string): string {
  return category === "Safety" ? "Safety / PPE" : category;
}


type QuickOrder = {
  id: string;
  date: string;
  items: string[];
  total: string;
};

const QUICK_REORDER_ORDERS: QuickOrder[] = [
  {
    id: "#E-4821",
    date: "12 May 2026",
    items: ["Drywall screws TX25", "Gypsum board 12.5mm", "Joint tape 50m", "Corner bead"],
    total: "€347.50",
  },
  {
    id: "#E-4789",
    date: "03 May 2026",
    items: ["Safety helmet white", "Work gloves L", "Dust masks FFP2 pack", "Safety glasses"],
    total: "€128.00",
  },
  {
    id: "#E-4755",
    date: "22 Apr 2026",
    items: ["Anchor bolts M10x80", "Sealant gun", "Silicone transparent 310ml", "Foam gun cleaner"],
    total: "€215.80",
  },
];

const THINKING_WORDS = [
  "Checking the catalog…",
  "Asking the procurement team…",
  "Looking up your project standards…",
  "Comparing suppliers…",
  "Tallying quantities…",
];

function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinkingWord, setThinkingWord] = useState(THINKING_WORDS[0]);
  const [recommendedIds, setRecommendedIds] = useState<string[]>([]);
  const [followups, setFollowups] = useState<string[]>([]);
  const { data: products = [] } = useProducts();
  const [aMaterialFlag, setAMaterialFlag] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<HybridSearchResult[] | null>(null);
  const [searchExtracted, setSearchExtracted] = useState<HybridExtracted | null>(null);
  const [searching, setSearching] = useState(false);
  const cart = useCart();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { logout } = useRole();
  const navigate = useNavigate();

  const inConversation = messages.length > 0;
  const showCatalog = inConversation || selectedCategory !== null;

  // Tiles derived from the live products table — every distinct `category`
  // value becomes a tile, with a sensible icon fallback. Adding a product
  // with a new category in the DB makes a new tile appear automatically.
  const categoryTiles = useMemo<CategoryTileData[]>(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      if (!p.category) continue;
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category]) => ({
        category,
        label: labelForCategory(category),
        icon: iconForCategory(category),
      }));
  }, [products]);


  // restore localStorage thread
  useEffect(() => {
    try {
      const saved = localStorage.getItem("comstruct-chat");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.messages) setMessages(parsed.messages);
        if (parsed.recommendedIds) setRecommendedIds(parsed.recommendedIds);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    localStorage.setItem(
      "comstruct-chat",
      JSON.stringify({ messages, recommendedIds }),
    );
  }, [messages, recommendedIds]);

  // focus input on load and after stream ends
  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming, inConversation]);

  // auto scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // Auto-run hybrid catalog search after every completed assistant turn.
  // Each new turn refines the search with the full chat log.
  const lastSearchTurnRef = useRef(0);
  useEffect(() => {
    if (streaming) return;
    if (messages.length === 0) return;
    if (messages.length === lastSearchTurnRef.current) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || !last.content) return;
    if (!messages.some((m) => m.role === "user")) return;
    lastSearchTurnRef.current = messages.length;
    runHybridSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, messages]);


  const sortedProducts = useMemo(() => {
    const filtered = selectedCategory
      ? products.filter((p) => p.category === selectedCategory)
      : products;
    const recSet = new Set(recommendedIds);
    const rec: Product[] = [];
    recommendedIds.forEach((sku) => {
      const p = filtered.find((x) => x.sku === sku);
      if (p) rec.push(p);
    });
    const rest = filtered.filter((p) => !recSet.has(p.sku));
    return [...rec, ...rest];
  }, [recommendedIds, products, selectedCategory]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages([...newHistory, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    setFollowups([]);
    setThinkingWord(THINKING_WORDS[Math.floor(Math.random() * THINKING_WORDS.length)]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newHistory.map((m) => ({ role: m.role, content: m.content })),
          cart: cart.items,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        toast.error(err || "Something went wrong");
        setStreaming(false);
        setMessages(newHistory); // drop empty assistant
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 2);
          if (!chunk.startsWith("data:")) continue;
          try {
            const evt = JSON.parse(chunk.slice(5).trim());
            handleEvent(evt);
          } catch {}
        }
      }
    } catch (e) {
      toast.error("Connection lost");
      console.error(e);
    } finally {
      setStreaming(false);
    }
  }

  function handleEvent(evt: { type: string; [k: string]: unknown }) {
    switch (evt.type) {
      case "delta": {
        const chunk = evt.content as string;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + chunk };
          }
          return next;
        });
        // Detect inline product tokens as they stream in so the
        // "Recommended for this job" panel below stays in sync.
        const re = /\[\[product:([A-Za-z0-9_-]+)(?::\d+)?\]\]/g;
        const found: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(chunk)) !== null) found.push(m[1]);
        if (found.length) {
          setRecommendedIds((prev) => {
            const set = new Set(prev);
            const add = found.filter((s) => !set.has(s));
            return add.length ? [...prev, ...add] : prev;
          });
        }
        break;
      }
      case "recommend":
        setRecommendedIds((prev) => {
          const skus = (evt.skus as string[]) ?? [];
          return [...prev, ...skus.filter((s) => !prev.includes(s))];
        });
        break;
      case "tool":
        handleTool(evt.name as string, evt.args as Record<string, unknown>);
        break;
      case "done":
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            const m = last.content.match(FOLLOWUPS_RE);
            if (m) {
              const parts = m[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 2);
              setFollowups(parts);
              next[next.length - 1] = { ...last, content: last.content.replace(FOLLOWUPS_RE, "").trimEnd() };
            } else {
              setFollowups([]);
            }
          }
          return next;
        });
        break;
    }
  }


  function handleTool(name: string, args: Record<string, unknown>) {
    if (name === "add_to_cart") {
      const sku = args.sku as string;
      const p = products.find((x) => x.sku === sku);
      if (!p) return;
      const qty = (args.quantity as number) || 1;
      cart.add({ productId: p.sku, name: p.name, price: p.price, qty, category: p.category, unit: p.unit, supplier: p.supplier });
      toast.success(`Added ${qty}× ${p.name} to cart`);
    } else if (name === "flag_as_a_material") {
      setAMaterialFlag((args.what_they_asked_for as string) || "this item");
    }
  }

  // voice handled by <VoiceButton />; transcript is sent immediately

  function reset() {
    setMessages([]);
    setRecommendedIds([]);
    setFollowups([]);
    setSelectedCategory(null);
    setSearchResults(null);
    setSearchExtracted(null);
    localStorage.removeItem("comstruct-chat");
  }

  async function runHybridSearch() {
    if (searching || messages.length === 0) return;
    setSearching(true);
    setSearchResults(null);
    setSearchExtracted(null);
    try {
      const res = await fetch("/api/hybrid-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Search failed");
        return;
      }
      setSearchExtracted(json.extracted ?? null);
      setSearchResults(Array.isArray(json.results) ? json.results : []);
      // bring results into view
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    } catch (e) {
      console.error("hybrid-search failed", e);
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-brand text-brand-foreground grid place-items-center">
              <HardHat className="size-5" />
            </div>
            <div className="leading-tight">
              <div className="font-semibold text-sm">comstruct</div>
              <button
                onClick={reset}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showCatalog ? "← new request" : "Project: Erlenmatt B3"}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              to="/orders"
              aria-label="My orders"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 h-10 text-xs font-medium hover:bg-accent"
            >
              <ClipboardList className="size-4" />
              Orders
            </Link>
            <Link
              to="/procurement"
              aria-label="Procurement view"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 h-10 text-xs font-medium hover:bg-accent"
            >
              <Building2 className="size-4" />
              Procurement
            </Link>
            <Link
              to="/settings"
              aria-label="Approval rules"
              className="grid size-10 place-items-center rounded-full border hover:bg-accent"
            >
              <SlidersHorizontal className="size-4" />
            </Link>
            <button
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              aria-label="Switch role"
              className="grid size-10 place-items-center rounded-full border hover:bg-accent"
            >
              <LogOut className="size-4" />
            </button>
            <button
              onClick={() => setCartOpen(true)}
              className="relative inline-flex items-center gap-2 rounded-full border px-3 h-10 text-sm font-medium hover:bg-accent"
            >
              <ShoppingCart className="size-4" />
              <span>{formatEUR(cart.subtotal)}</span>
              {cart.count > 0 && (
                <span className="absolute -top-1 -right-1 size-5 rounded-full bg-brand text-brand-foreground text-[10px] font-bold grid place-items-center">
                  {cart.count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {!showCatalog ? (
          <HeroView
            categoryTiles={categoryTiles}
            input={input}
            setInput={setInput}
            send={send}
            onSelectCategory={setSelectedCategory}
            inputRef={inputRef}
            onAddQuickOrder={(items) => {
              let added = 0;
              for (const itemName of items) {
                const product = products.find((p) =>
                  p.name.toLowerCase().includes(itemName.toLowerCase()) ||
                  itemName.toLowerCase().includes(p.name.toLowerCase())
                );
                if (product) {
                  cart.add({
                    productId: product.sku,
                    name: product.name,
                    price: product.price,
                    category: product.category,
                    unit: product.unit,
                    qty: 1,
                    supplier: product.supplier,
                  });
                  added++;
                }
              }
              if (added > 0) {
                toast.success(`Added ${added} item${added === 1 ? "" : "s"} to cart`);
                setCartOpen(true);
              } else {
                toast.info("No matching products found in catalog");
              }
            }}
          />
        ) : (
          <ConversationView
            messages={messages}
            streaming={streaming}
            thinkingWord={thinkingWord}
            scrollRef={scrollRef}
            sortedProducts={sortedProducts}
            recommendedIds={recommendedIds}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            onClearCategory={() => setSelectedCategory(null)}
            onResetRecommendations={() => setRecommendedIds([])}
            onSuggestion={(s) => send(s)}
            followups={followups}
            allProducts={products}
            categoryTiles={categoryTiles}
            onRunSearch={runHybridSearch}
            searching={searching}
            searchResults={searchResults}
            searchExtracted={searchExtracted}
          />

        )}
      </main>

      {/* Sticky bottom bar in conversation mode: chat input + separate, distinct voice button */}
      {inConversation && (
        <div className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-end gap-3">
            <div className="flex-1">
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={() => send(input)}
                disabled={streaming}
                inputRef={inputRef}
                placeholder="Ask a follow-up…"
              />
            </div>
            <ScanButton size="compact" onResult={(prompt) => send(prompt)} />
            <VoiceButton size="compact" onTranscript={(t) => send(t)} />
          </div>
        </div>
      )}

      {/* Approval banner — driven by budget/rules decision */}
      <ApprovalBanner />


      {/* A-material modal */}
      {aMaterialFlag && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-semibold text-lg">That's an A-material</h3>
            <p className="text-sm text-muted-foreground mt-2">
              "{aMaterialFlag}" is handled by your project manager through the main procurement flow. Want me to ping them?
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                className="px-4 h-10 rounded-md text-sm font-medium hover:bg-accent"
                onClick={() => setAMaterialFlag(null)}
              >
                Never mind
              </button>
              <button
                className="px-4 h-10 rounded-md bg-brand text-brand-foreground text-sm font-semibold"
                onClick={() => {
                  toast.success("PM notified");
                  setAMaterialFlag(null);
                }}
              >
                Notify PM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
    </div>
  );
}

function HeroView({
  input,
  setInput,
  send,
  onSelectCategory,
  inputRef,
  onAddQuickOrder,
  categoryTiles,
}: {
  input: string;
  setInput: (v: string) => void;
  send: (v: string) => void;
  onSelectCategory: (c: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onAddQuickOrder: (items: string[]) => void;
  categoryTiles: CategoryTileData[];
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Decorative icon row — SubBase-style colored tiles */}
        <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
          <IconTile icon={CompassIcon} tone="brand" size="sm" />
          <IconTile icon={CraneIcon} tone="dark" size="sm" />
          <IconTile icon={GearIcon} tone="light" size="sm" />
          <IconTile icon={ShovelIcon} tone="brand" size="sm" />
          <IconTile icon={ConeIcon} tone="outline" size="sm" />
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-center">
          What do you need on site?
        </h1>
        <p className="mt-3 text-center text-muted-foreground">
          Speak it, snap a photo, or type — we'll figure out what you need.
        </p>


        {/* Primary action CTAs — voice (brand) + scan (grey), visually distinct */}
        <div className="mt-8 flex justify-center items-start gap-8">
          <VoiceButton size="hero" onTranscript={(t) => send(t)} />
          <ScanButton size="hero" onResult={(prompt) => send(prompt)} />
        </div>

        <div className="my-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <div className="flex-1 h-px bg-border" />
          or type
          <div className="flex-1 h-px bg-border" />
        </div>

        <div>
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => send(input)}
            disabled={false}
            inputRef={inputRef}
            placeholder="Describe the job…"
            big
          />
        </div>

        <div className="mt-6 -mx-4 px-4 overflow-x-auto">
          <div className="flex gap-2 min-w-min">
            {SUGGESTED_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => send(chip)}
                className="shrink-0 rounded-full border bg-card hover:bg-accent px-4 h-10 text-sm font-medium"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wide">
            <div className="flex-1 h-px bg-border" />
            or browse by category
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {categoryTiles.map((c) => (
              <CategoryTile key={c.category} tile={c} onSelect={() => onSelectCategory(c.category)} />
            ))}
          </div>
        </div>

        {/* Quick Reorder — dummy orders for now */}
        <div className="mt-10">
          <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wide">
            <div className="flex-1 h-px bg-border" />
            quick reorder
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="mt-4 space-y-3">
            {([
              {
                id: "#E-4821",
                date: "12 May 2026",
                items: ["Drywall screws TX25", "Gypsum board 12.5mm", "Joint tape 50m", "Corner bead"],
                total: "€347.50",
              },
              {
                id: "#E-4789",
                date: "03 May 2026",
                items: ["Safety helmet white", "Work gloves L", "Dust masks FFP2 pack", "Safety glasses"],
                total: "€128.00",
              },
              {
                id: "#E-4755",
                date: "22 Apr 2026",
                items: ["Anchor bolts M10x80", "Sealant gun", "Silicone transparent 310ml", "Foam gun cleaner"],
                total: "€215.80",
              },
            ] as QuickOrder[]).map((order) => (
              <div
                key={order.id}
                className="w-full rounded-xl border bg-card p-4 transition-colors hover:border-brand/40"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{order.id}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3.5" />
                      {order.date}
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{order.total}</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {order.items.slice(0, 3).join(" · ")}
                  {order.items.length > 3 && ` · +${order.items.length - 3} more`}
                </div>
                <button
                  onClick={() => onAddQuickOrder(order.items)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <ShoppingCart className="size-3.5" />
                  Add all to cart
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryTile({
  tile,
  onSelect,
}: {
  tile: CategoryTileData;
  onSelect: () => void;
}) {
  const Icon = tile.icon;
  return (
    <button
      onClick={onSelect}
      className="group flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-4 aspect-square text-center transition-colors hover:bg-accent hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <span className="grid size-12 place-items-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
        <Icon className="size-6" strokeWidth={2} />
      </span>
      <span className="text-xs font-semibold leading-tight">{tile.label}</span>
    </button>
  );
}

function ConversationView({
  messages,
  streaming,
  thinkingWord,
  scrollRef,
  sortedProducts,
  recommendedIds,
  selectedCategory,
  onSelectCategory,
  onClearCategory,
  onResetRecommendations,
  onSuggestion,
  followups,
  allProducts,
  onRunSearch,
  searching,
  searchResults,
  searchExtracted,
  categoryTiles,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  thinkingWord: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  sortedProducts: Product[];
  recommendedIds: string[];
  selectedCategory: string | null;
  onSelectCategory: (c: string) => void;
  onClearCategory: () => void;
  onResetRecommendations: () => void;
  onSuggestion: (s: string) => void;
  followups: string[];
  allProducts: Product[];
  onRunSearch: () => void;
  searching: boolean;
  searchResults: HybridSearchResult[] | null;
  searchExtracted: HybridExtracted | null;
  categoryTiles: CategoryTileData[];
}) {
  const recSet = new Set(recommendedIds);
  const lastAssistant = messages[messages.length - 1]?.role === "assistant" ? messages[messages.length - 1] : null;
  const isThinking = streaming && (!lastAssistant || lastAssistant.content === "");

  // When no explicit category filter is active, show ONLY the recommended
  // picks above, then the same category-tile grid as the landing page.
  // When a category tile is clicked, fall back to the full filtered catalog.
  const showTilesLayout = !selectedCategory;
  const recommendedProducts = recommendedIds
    .map((sku) => allProducts.find((p) => p.sku === sku))
    .filter((p): p is Product => !!p);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4 pb-32">
        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} products={allProducts} />
        ))}
        {isThinking && (
          <div className="text-sm text-muted-foreground italic flex items-center gap-2">
            <span className="size-2 rounded-full bg-brand animate-pulse" />
            {thinkingWord}
          </div>
        )}

        {/* suggestions */}
        {!streaming && lastAssistant && (
          <div className="flex flex-wrap gap-2 pt-1">
            <SuggestionButton onClick={() => onSuggestion("Add the bundle to cart")}>
              Add the bundle to cart
            </SuggestionButton>
            {followups.map((f) => (
              <SuggestionButton key={f} onClick={() => onSuggestion(f)}>
                {f}
              </SuggestionButton>
            ))}
          </div>
        )}

        {/* Auto-refreshing hybrid catalog search — re-runs after every assistant turn */}
        {(searching || searchResults) && (
          <div className="pt-3">
            <div className="flex items-end justify-between mb-3 border-b-2 border-brand/70 pb-2">
              <h2 className="text-lg font-bold text-brand">Catalog matches</h2>
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                {searching ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Refining…
                  </>
                ) : (
                  <>top {Math.min(searchResults?.length ?? 0, 5)} · cheapest first</>
                )}
              </span>
            </div>
            {searchExtracted && !searching && (
              <p className="mb-3 text-xs text-muted-foreground">
                Query: <span className="font-medium text-foreground">{searchExtracted.semantic_search_string}</span>
                {searchExtracted.extracted_category && (
                  <> · in <span className="font-medium">{searchExtracted.extracted_category}</span></>
                )}
                {searchExtracted.extracted_keywords.length > 0 && (
                  <> · {searchExtracted.extracted_keywords.slice(0, 6).join(" · ")}</>
                )}
              </p>
            )}
            {searchResults && searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No matches found.
              </p>
            ) : searchResults ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {searchResults.slice(0, 5).map((r) => (
                  <SearchResultCard key={r.sku} result={r} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>




      {showTilesLayout ? (
        <>
          {/* Recommended picks above */}
          {recommendedProducts.length > 0 && (
            <div className="border-t bg-muted/30">
              <div className="mx-auto max-w-5xl px-4 py-6">
                <div className="flex items-end justify-between mb-4 border-b-2 border-brand/70 pb-2">
                  <h2 className="text-xl font-bold text-brand">Recommended for this job</h2>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">{recommendedProducts.length} Products</span>
                    <button
                      onClick={onResetRecommendations}
                      className="text-sm font-medium text-brand hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {recommendedProducts.map((p) => (
                    <ProductCard key={p.sku} product={p} recommended dimmed={false} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Category tiles — identical to landing page */}
          <div className="border-t">
            <div className="mx-auto max-w-2xl px-4 py-8">
              <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wide">
                <div className="flex-1 h-px bg-border" />
                or browse by category
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {categoryTiles.map((c) => (
                  <CategoryTile key={c.category} tile={c} onSelect={() => onSelectCategory(c.category)} />
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Full filtered catalog grid — when a category tile was clicked */
        <div className="border-t bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-6">
            <div className="flex items-end justify-between mb-4 border-b-2 border-brand/70 pb-2">
              <h2 className="text-xl font-bold text-brand">{selectedCategory}</h2>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">{sortedProducts.length} Products</span>
                <button
                  onClick={onClearCategory}
                  className="text-sm font-medium text-brand hover:underline"
                >
                  Clear filter
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sortedProducts.map((p) => (
                <ProductCard
                  key={p.sku}
                  product={p}
                  recommended={recSet.has(p.sku)}
                  dimmed={false}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function MessageBubble({ msg, products }: { msg: ChatMessage; products: Product[] }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] text-[15px]">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex">
      <div className="text-[15px] leading-relaxed max-w-[90%]">
        <AssistantContent content={msg.content} products={products} />
        {msg.content === "" && <span className="inline-block w-1 h-4 bg-foreground/40 animate-pulse" />}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Assistant content: renders markdown, with [[product:SKU:QTY]] tokens       */
/* replaced by inline product pills.                                          */
/* -------------------------------------------------------------------------- */

const PRODUCT_TOKEN_RE = /\[\[product:([A-Za-z0-9_-]+)(?::(\d+))?\]\]/g;
const FOLLOWUPS_RE = /\[\[followups:([^\]]+)\]\]/;
// Marker we inject as inline `code` so markdown parsing preserves it.
const TOKEN_PREFIX = "§§PROD§§";

function AssistantContent({
  content,
  products,
}: {
  content: string;
  products: Product[];
}) {
  const prepared = useMemo(
    () =>
      content
        .replace(FOLLOWUPS_RE, "")
        // Hide partial trailing marker while streaming.
        .replace(/\[\[followups:[^\]]*$/, "")
        .replace(/\[\[follow?u?p?s?:?$/, "")
        .replace(PRODUCT_TOKEN_RE, (_m, sku, qty) =>
          `\`${TOKEN_PREFIX}${sku}:${qty ?? ""}\``,
        ),
    [content],
  );

  return (
    <div className="text-[15px] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2">{children}</p>,
          h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[15px] font-bold mt-3 mb-1.5">{children}</h3>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="my-2 pl-5 list-disc marker:text-brand space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 pl-5 list-decimal marker:text-brand space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} className="text-brand underline underline-offset-2" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-brand/40 pl-3 my-2 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children, className, ...rest }: { children?: React.ReactNode; className?: string }) => {
            const raw = String(children ?? "");
            if (raw.startsWith(TOKEN_PREFIX)) {
              const body = raw.slice(TOKEN_PREFIX.length);
              const [sku, qtyStr] = body.split(":");
              const qty = qtyStr ? parseInt(qtyStr, 10) : undefined;
              const p = products.find((x) => x.sku === sku);
              if (p) return <InlineProductBubble product={p} suggestedQty={qty} />;
              return (
                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {sku}
                </span>
              );
            }
            return (
              <code className={`font-mono text-[0.85em] px-1 py-0.5 rounded bg-muted ${className ?? ""}`} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

function InlineProductBubble({
  product,
  suggestedQty,
}: {
  product: Product;
  suggestedQty?: number;
}) {
  const cart = useCart();
  const [showDetail, setShowDetail] = useState(false);
  const inCart = cart.items.find((i) => i.productId === product.sku);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const addQty = suggestedQty && suggestedQty > 0 ? suggestedQty : 1;

  function add(e: React.MouseEvent) {
    stop(e);
    cart.add({
      productId: product.sku,
      name: product.name,
      price: product.price,
      qty: addQty,
      category: product.category,
      unit: product.unit,
      supplier: product.supplier,
    });
  }

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setShowDetail(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowDetail(true);
          }
        }}
        className="inline-flex align-middle items-center gap-2 my-0.5 mx-0.5 max-w-full rounded-full border border-brand/40 bg-brand/5 hover:bg-brand/10 hover:border-brand transition-colors cursor-pointer pr-1 pl-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        title={`${product.sku} — ${product.name}`}
      >
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className="shrink-0 size-7 rounded-full overflow-hidden"
          fallbackClassName="shrink-0 size-7 rounded-full bg-muted text-base"
        />
        <span className="font-semibold text-[13px] leading-tight truncate max-w-[14rem] sm:max-w-[20rem]">
          {product.name}
        </span>
        {inCart ? (
          <span
            onClick={stop}
            className="ml-1 inline-flex items-center rounded-full bg-background border h-7 overflow-hidden shrink-0"
          >
            <button
              onClick={(e) => {
                stop(e);
                cart.setQty(product.sku, inCart.qty - 1);
              }}
              className="w-7 h-full grid place-items-center hover:bg-accent text-base font-semibold"
              aria-label="Decrease"
            >
              −
            </button>
            <span className="px-1.5 text-xs font-bold tabular-nums">{inCart.qty}</span>
            <button
              onClick={(e) => {
                stop(e);
                cart.setQty(product.sku, inCart.qty + 1);
              }}
              className="w-7 h-full grid place-items-center hover:bg-accent text-base font-semibold"
              aria-label="Increase"
            >
              +
            </button>
          </span>
        ) : (
          <button
            onClick={add}
            className="ml-1 shrink-0 inline-flex items-center gap-1.5 rounded-full bg-brand text-brand-foreground px-2.5 h-7 text-xs font-bold"
            aria-label={`Add ${addQty} ${product.name} to cart`}
          >
            <Plus className="size-3.5" />
            <span className="tabular-nums">
              {addQty > 1 ? `Add ${addQty} · ${formatEUR(product.price)} ea` : `Add · ${formatEUR(product.price)}`}
            </span>
          </button>
        )}
      </span>
      {showDetail && (
        <ProductDetailModal product={product} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}

function SuggestionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-brand text-brand-foreground hover:opacity-90 px-3 h-9 text-sm font-medium"
    >
      {children}
    </button>
  );
}

function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  inputRef,
  placeholder,
  big,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  big?: boolean;
}) {
  return (
    <div
      className={`relative flex items-end gap-2 rounded-2xl border bg-card shadow-sm focus-within:ring-2 focus-within:ring-brand/40 ${
        big ? "px-4 py-3" : "px-3 py-2"
      }`}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={1}
        placeholder={placeholder}
        className={`flex-1 resize-none bg-transparent outline-none placeholder:text-muted-foreground ${
          big ? "text-lg min-h-[40px]" : "text-base min-h-[28px]"
        }`}
        style={{ maxHeight: 160 }}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="shrink-0 size-11 grid place-items-center rounded-xl bg-brand text-brand-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Send"
      >
        <ArrowUp className="size-5" />
      </button>
    </div>
  );
}

function ProductCard({
  product,
  recommended,
  dimmed,
}: {
  product: Product;
  recommended: boolean;
  dimmed: boolean;
}) {
  const cart = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const inCart = cart.items.find((i) => i.productId === product.sku);

  function add(e?: React.MouseEvent) {
    e?.stopPropagation();
    cart.add({
      productId: product.sku,
      name: product.name,
      price: product.price,
      qty: 1,
      category: product.category,
      unit: product.unit,
      supplier: product.supplier,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShowDetail(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowDetail(true);
          }
        }}
        className={`group relative rounded-md border bg-card p-4 flex gap-4 transition-all duration-300 cursor-pointer hover:border-foreground/30 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/40 ${
          dimmed ? "opacity-20 pointer-events-none" : "opacity-100"
        } ${recommended ? "border-brand border-2" : ""}`}
      >
        {recommended && (
          <div className="absolute -top-2 left-3 bg-brand text-brand-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
            Pick
          </div>
        )}

        <div className="shrink-0 w-28 h-28 sm:w-32 sm:h-32 bg-muted/50 rounded grid place-items-center text-4xl">
          📦
        </div>



        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className="font-bold text-base leading-tight text-foreground line-clamp-2">
            {product.name}
          </h3>
          {product.description && (
            <p className="text-sm text-muted-foreground leading-snug mt-1 line-clamp-3">
              {product.description}
            </p>
          )}
          <div className="mt-auto pt-2 flex items-end justify-between gap-2">
            <div className="text-xs text-muted-foreground min-w-0">
              <div className="font-mono truncate">{product.sku}</div>
              {product.supplier && <div className="truncate">{product.supplier}</div>}
            </div>
            {inCart ? (
              <div onClick={stop} className="flex items-center rounded-md border h-11 overflow-hidden shrink-0">
                <button
                  onClick={(e) => { stop(e); cart.setQty(product.sku, inCart.qty - 1); }}
                  className="w-11 h-full grid place-items-center hover:bg-accent text-xl font-semibold"
                  aria-label="Decrease"
                >
                  −
                </button>
                <span className="px-3 text-base font-bold tabular-nums">{inCart.qty}</span>
                <button
                  onClick={(e) => { stop(e); cart.setQty(product.sku, inCart.qty + 1); }}
                  className="w-11 h-full grid place-items-center hover:bg-accent text-xl font-semibold"
                  aria-label="Increase"
                >
                  +
                </button>
              </div>
            ) : (
              <button
                onClick={add}
                className="shrink-0 h-11 flex items-stretch rounded-md overflow-hidden bg-foreground text-background font-bold text-sm"
              >
                <span className="px-3 grid place-items-center tabular-nums">{formatEUR(product.price)}</span>
                <span className="w-11 grid place-items-center bg-brand text-brand-foreground">
                  {justAdded ? <Check className="size-5" /> : <Plus className="size-5" />}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
      {showDetail && (
        <ProductDetailModal product={product} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}

function ProductDetailModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const cart = useCart();
  const inCart = cart.items.find((i) => i.productId === product.sku);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  function addOne() {
    cart.add({
      productId: product.sku,
      name: product.name,
      price: product.price,
      qty: 1,
      category: product.category,
      unit: product.unit,
      supplier: product.supplier,
    });
  }

  const attrEntries = Object.entries(product.attributes ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== ""
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-background sm:rounded-xl shadow-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col">
        <div className="sticky top-0 z-10 flex items-start gap-3 px-5 py-4 border-b bg-background">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <span>{product.sku}</span>
              {product.supplier && <><span>·</span><span className="font-sans">{product.supplier}</span></>}
            </div>
            <h2 className="font-bold text-xl leading-tight mt-1">{product.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="size-11 grid place-items-center rounded-md hover:bg-accent shrink-0"
            aria-label="Close"
          >
            <X className="size-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="flex gap-4 items-start">
            <div className="shrink-0 w-32 h-32 bg-muted/50 rounded grid place-items-center text-5xl">
              📦
            </div>


            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <div className="text-3xl font-bold tabular-nums">{formatEUR(product.price)}</div>
                <div className="text-sm text-muted-foreground">per {product.unit}</div>
              </div>
              {inCart ? (
                <div className="flex items-center rounded-md border h-12 overflow-hidden w-fit">
                  <button
                    onClick={() => cart.setQty(product.sku, inCart.qty - 1)}
                    className="w-12 h-full grid place-items-center hover:bg-accent text-2xl font-semibold"
                    aria-label="Decrease"
                  >−</button>
                  <span className="px-4 text-lg font-bold tabular-nums">{inCart.qty}</span>
                  <button
                    onClick={() => cart.setQty(product.sku, inCart.qty + 1)}
                    className="w-12 h-full grid place-items-center hover:bg-accent text-2xl font-semibold"
                    aria-label="Increase"
                  >+</button>
                </div>
              ) : (
                <button
                  onClick={addOne}
                  className="h-12 px-5 rounded-md bg-brand text-brand-foreground font-bold flex items-center gap-2"
                >
                  <Plus className="size-5" /> Add to cart
                </button>
              )}
              {product.hazardous && (
                <div className="inline-flex items-center gap-2 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 px-3 py-1.5 text-sm font-semibold">
                  ⚠ Hazardous material
                </div>
              )}
            </div>
          </div>

          {product.description && (
            <Section title="About">
              <p className="text-base leading-relaxed text-foreground/90">{product.description}</p>
            </Section>
          )}

          {product.useCases && product.useCases.length > 0 && (
            <Section title="When to use it">
              <ul className="space-y-3">
                {product.useCases.map((uc, i) => (
                  <li key={i} className="rounded-md border bg-muted/30 p-3">
                    <div className="font-semibold text-base">{uc.scenario}</div>
                    {uc.why && (
                      <div className="text-sm text-muted-foreground mt-1 leading-relaxed">{uc.why}</div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {attrEntries.length > 0 && (
            <Section title="Specifications">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {attrEntries.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-border/50 py-1.5">
                    <dt className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                    <dd className="font-semibold text-right">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {(product.storageLocation || product.typicalSite || product.consumable || product.sourceCategory) && (
            <Section title="On site">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {product.typicalSite && <DetailRow label="Typical site" value={product.typicalSite} />}
                {product.storageLocation && <DetailRow label="Storage" value={product.storageLocation} />}
                {product.consumable && <DetailRow label="Consumable" value={product.consumable} />}
                {product.sourceCategory && <DetailRow label="Category" value={product.sourceCategory} />}
              </dl>
            </Section>
          )}

          {product.keywords && product.keywords.length > 0 && (
            <Section title="Also known as">
              <div className="flex flex-wrap gap-1.5">
                {product.keywords.map((k) => (
                  <span key={k} className="text-xs bg-muted text-muted-foreground rounded-full px-2.5 py-1">
                    {k}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wide text-brand mb-2">{title}</h3>
      {children}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/50 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-right">{value}</dd>
    </div>
  );
}

function CartDrawer({ onClose }: { onClose: () => void }) {
  const cart = useCart();
  const orders = useOrders();
  const navigate = useNavigate();
  const tier = tierFor(cart.subtotal);
  const startNegotiation = useServerFn(startNegotiationForOrder);

  async function submit() {
    if (cart.items.length === 0) return;
    const created = orders.createFromCart(cart.items);
    cart.clear();
    onClose();
    // Generate the EU-standard PO PDF and trigger a download for the foreman.
    const { generatePurchaseOrderPdf, purchaseOrderFilename, purchaseOrderPdfBase64 } = await import(
      "@/lib/po-pdf"
    );
    generatePurchaseOrderPdf(created).save(purchaseOrderFilename(created));

    if (created.tier === "auto") {
      // Group items by supplier and build per-supplier PO PDFs to attach.
      const FALLBACK = "Generisch";
      const groups = new Map<string, typeof created.items>();
      for (const it of created.items) {
        const key = (it.supplier && it.supplier.trim()) || FALLBACK;
        const arr = groups.get(key) ?? [];
        arr.push(it);
        groups.set(key, arr);
      }
      const attachments = Array.from(groups.entries()).map(([supplierName, items]) => {
        const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
        const pdfBase64 = purchaseOrderPdfBase64(created, {
          supplier: { name: supplierName },
          itemsOverride: items,
          subtotalOverride: subtotal,
        });
        return {
          supplierName,
          filename: purchaseOrderFilename(created, supplierName),
          pdfBase64,
        };
      });

      const supplierCount = groups.size;
      const sendingToast = toast.loading(
        `${created.id}: contacting ${supplierCount} supplier${supplierCount === 1 ? "" : "s"}…`,
      );
      try {
        const res = (await startNegotiation({
          data: {
            order: {
              id: created.id,
              project: created.project,
              subtotal: created.subtotal,
              items: created.items.map((i) => ({
                productId: i.productId,
                name: i.name,
                qty: i.qty,
                price: i.price,
                unit: i.unit,
                category: i.category,
                supplier: i.supplier ?? null,
              })),
            },
            attachments,
          },
        })) as
          | { ok: true; results: Array<{ supplier: string; email: string }> }
          | { ok: false; error: string };
        if (res?.ok) {
          const labels = res.results.map((r) => r.supplier).join(", ");
          toast.success(`${created.id} sent to ${labels} · PO PDF downloaded`, { id: sendingToast });
        } else {
          toast.error(`Email agent failed: ${res?.error ?? "unknown error"}`, { id: sendingToast });
        }
      } catch (e) {
        console.error("startNegotiationForOrder error:", e);
        toast.error("Email agent failed to start", { id: sendingToast });
      }
    } else if (created.tier === "pm") {
      toast.success(`${created.id} sent to ${PM.name} for approval · PO PDF downloaded`);
    } else {
      toast.success(`${created.id} sent to ${CENTRAL.name} for approval · PO PDF downloaded`);
    }
    navigate({ to: "/orders/$orderId/track", params: { orderId: created.id } });
  }


  const ctaLabel =
    tier === "auto"
      ? "Send order to supplier"
      : tier === "pm"
        ? "Send for PM approval"
        : "Send for central approval";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-background h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 h-14 border-b">
          <h2 className="font-semibold">Cart ({cart.count})</h2>
          <button onClick={onClose} className="size-9 grid place-items-center rounded-md hover:bg-accent">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <ChocolateIncentive subtotal={cart.subtotal} />
          {cart.items.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-12">Cart is empty</div>
          )}
          {cart.items.map((i) => (
            <div key={i.productId} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm leading-tight">{i.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatEUR(i.price)} / {i.unit}
                  </div>
                </div>
                <button
                  onClick={() => cart.remove(i.productId)}
                  className="size-8 grid place-items-center text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Remove"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center rounded-md border h-10 overflow-hidden">
                  <button
                    onClick={() => cart.setQty(i.productId, i.qty - 1)}
                    className="w-10 h-full grid place-items-center hover:bg-accent text-lg font-semibold"
                    aria-label="Decrease"
                  >−</button>
                  <span className="px-3 text-base font-bold tabular-nums min-w-[2.5rem] text-center">{i.qty}</span>
                  <button
                    onClick={() => cart.setQty(i.productId, i.qty + 1)}
                    className="w-10 h-full grid place-items-center hover:bg-accent text-lg font-semibold"
                    aria-label="Increase"
                  >+</button>
                </div>
                <div className="font-bold text-base tabular-nums">{formatEUR(i.qty * i.price)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t p-4 space-y-3">
          {cart.items.length > 0 && <ApprovalTierPill tier={tier} subtotal={cart.subtotal} />}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold">{formatEUR(cart.subtotal)}</span>
          </div>
          <button
            disabled={cart.items.length === 0}
            onClick={submit}
            className="w-full h-12 rounded-lg bg-brand text-brand-foreground font-semibold disabled:opacity-40"
          >
            {ctaLabel}
          </button>
          <Link
            to="/settings"
            className="block text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Adjust budget &amp; rules
          </Link>
        </div>
      </div>
    </div>
  );
}

function ChocolateIncentive({ subtotal }: { subtotal: number }) {
  const remaining = Math.max(0, CHOCOLATE_THRESHOLD - subtotal);
  const unlocked = remaining === 0;
  const progress = Math.min(100, (subtotal / CHOCOLATE_THRESHOLD) * 100);
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="aspect-[16/10] bg-muted overflow-hidden">
        <img
          src={chocolatesImg}
          alt="Complimentary box of Swiss artisan chocolates"
          width={1024}
          height={640}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-semibold leading-tight">
            Free box of Swiss chocolates
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
            Gift
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {unlocked
            ? "Unlocked — we'll ship a box with your delivery."
            : `Spend ${formatEUR(remaining)} more to unlock a complimentary box with your next delivery.`}
        </p>
        <div className="h-1.5 w-full rounded-sm bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ApprovalTierPill({ tier, subtotal }: { tier: ApprovalTier; subtotal: number }) {
  const styles = {
    auto: {
      box: "border-emerald-500/40 bg-emerald-500/10",
      title: "text-emerald-700 dark:text-emerald-400",
      label: "Auto-approved",
      body: `Subtotal ${formatEUR(subtotal)} is under ${formatEUR(TIER_THRESHOLDS.pm)} — order ships straight to the supplier.`,
    },
    pm: {
      box: "border-amber-500/40 bg-amber-500/10",
      title: "text-amber-700 dark:text-amber-400",
      label: `Needs PM approval — ${PM.name}`,
      body: `Subtotal ${formatEUR(subtotal)} is between ${formatEUR(TIER_THRESHOLDS.pm)} and ${formatEUR(TIER_THRESHOLDS.central)}.`,
    },
    central: {
      box: "border-rose-500/40 bg-rose-500/10",
      title: "text-rose-700 dark:text-rose-400",
      label: `Needs central approval — ${CENTRAL.name}`,
      body: `Subtotal ${formatEUR(subtotal)} is above ${formatEUR(TIER_THRESHOLDS.central)}.`,
    },
  }[tier];
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${styles.box}`}>
      <div className={`font-semibold ${styles.title}`}>{styles.label}</div>
      <div className="text-muted-foreground mt-0.5">{styles.body}</div>
    </div>
  );
}

function ApprovalBanner() {
  const cart = useCart();
  const decision = useCheckoutDecision(cart.items);
  if (cart.items.length === 0 || decision.action !== "requires_approval") return null;
  const headline = decision.hits[0]?.message ?? "Needs PM approval";
  return (
    <div className="fixed bottom-[88px] left-0 right-0 z-40 mx-auto max-w-3xl px-4 pointer-events-none">
      <div className="pointer-events-auto rounded-lg bg-brand text-brand-foreground px-4 py-3 shadow-lg flex items-center justify-between gap-3 text-sm font-medium">
        <span className="line-clamp-2">{headline}</span>
        <button
          className="shrink-0 rounded-md bg-background/20 hover:bg-background/30 px-3 py-1.5 text-xs font-semibold"
          onClick={() => toast.success("Sent for PM approval")}
        >
          Send for approval
        </button>
      </div>
    </div>
  );
}


function SearchResultCard({ result }: { result: HybridSearchResult }) {
  const cart = useCart();
  const price = Number(result.price_eur);
  return (
    <div className="rounded-md border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{result.category}</span>
            <span>·</span>
            <span className="font-mono">{result.sku}</span>
          </div>
          <h3 className="font-semibold text-sm mt-1 leading-tight">{result.name}</h3>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-bold">{formatEUR(price)}</div>
          <div className="text-[10px] text-muted-foreground">/{result.unit}</div>
        </div>
      </div>
      {result.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{result.description}</p>
      )}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-muted-foreground">
          match {(result.similarity * 100).toFixed(0)}%
          {result.keyword_score > 0 && ` · ${result.keyword_score} kw`}
        </span>
        <button
          onClick={() => {
            cart.add({
              productId: result.sku,
              name: result.name,
              price,
              qty: 1,
              category: result.category,
              unit: result.unit,
              supplier: result.supplier,
            });
            toast.success(`Added ${result.name} to cart`);
          }}
          className="inline-flex items-center gap-1 rounded-md bg-brand text-brand-foreground px-2.5 h-8 text-xs font-semibold hover:opacity-90"
        >
          <Plus className="size-3.5" /> Add
        </button>
      </div>
    </div>
  );
}



