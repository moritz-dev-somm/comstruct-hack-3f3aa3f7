import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Anchor,
  ArrowUp,
  Bolt,
  Building2,
  Check,
  ClipboardList,
  Droplets,
  Hammer,
  HardHat,
  Package,
  Plus,
  Ruler,
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

// Tiles mirror the canonical `category` values in the products table.
// Keep this list in sync with the DB — if a new category is added, add a
// tile here (and vice versa) so the filter never shows an empty result.
const CATEGORY_TILES: CategoryTileData[] = [
  { label: "Fasteners",     icon: Bolt,     category: "Fasteners" },
  { label: "Safety / PPE",  icon: HardHat,  category: "Safety" },
  { label: "Hand Tools",    icon: Hammer,   category: "Hand Tools" },
  { label: "Power & Light", icon: Zap,      category: "Power & Light" },
  { label: "Sealing",       icon: Droplets, category: "Sealing" },
  { label: "Measuring",     icon: Ruler,    category: "Measuring" },
  { label: "Anchors",       icon: Anchor,   category: "Anchors" },
  { label: "Other",         icon: Package,  category: "Other" },
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
  const { data: products = [] } = useProducts();
  const [aMaterialFlag, setAMaterialFlag] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const cart = useCart();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { logout } = useRole();
  const navigate = useNavigate();

  const inConversation = messages.length > 0;
  const showCatalog = inConversation || selectedCategory !== null;

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
      case "delta":
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + (evt.content as string) };
          }
          return next;
        });
        break;
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
        break;
    }
  }

  function handleTool(name: string, args: Record<string, unknown>) {
    if (name === "add_to_cart") {
      const sku = args.sku as string;
      const p = products.find((x) => x.sku === sku);
      if (!p) return;
      const qty = (args.quantity as number) || 1;
      cart.add({ productId: p.sku, name: p.name, price: p.price, qty, category: p.category, unit: p.unit });
      toast.success(`Added ${qty}× ${p.name} to cart`);
    } else if (name === "flag_as_a_material") {
      setAMaterialFlag((args.what_they_asked_for as string) || "this item");
    }
  }

  // voice handled by <VoiceButton />; transcript is sent immediately

  function reset() {
    setMessages([]);
    setRecommendedIds([]);
    setSelectedCategory(null);
    localStorage.removeItem("comstruct-chat");
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
            input={input}
            setInput={setInput}
            send={send}
            onSelectCategory={setSelectedCategory}
            inputRef={inputRef}
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
            allProducts={products}
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
}: {
  input: string;
  setInput: (v: string) => void;
  send: (v: string) => void;
  onSelectCategory: (c: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-center">
          What do you need on site?
        </h1>
        <p className="mt-3 text-center text-muted-foreground">
          Describe the job in your own words — speak it or type it.
        </p>

        {/* Primary voice CTA — visually distinct, separated from the chat bar */}
        <div className="mt-8 flex justify-center">
          <VoiceButton size="hero" onTranscript={(t) => send(t)} />
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
            {CATEGORY_TILES.map((c) => (
              <CategoryTile key={c.label} tile={c} onSelect={() => onSelectCategory(c.category)} />
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
  allProducts,
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
  allProducts: Product[];
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
          <MessageBubble key={i} msg={m} />
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
            <SuggestionButton onClick={() => onSuggestion("Show me cheaper options")}>
              Show me cheaper options
            </SuggestionButton>
            <SuggestionButton onClick={() => onSuggestion("Show me alternative suppliers")}>
              Different brand
            </SuggestionButton>
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
                {CATEGORY_TILES.map((c) => (
                  <CategoryTile key={c.label} tile={c} onSelect={() => onSelectCategory(c.category)} />
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


function MessageBubble({ msg }: { msg: ChatMessage }) {
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
      <div className="text-[15px] leading-relaxed whitespace-pre-wrap max-w-[90%]">
        {msg.content}
        {msg.content === "" && <span className="inline-block w-1 h-4 bg-foreground/40 animate-pulse" />}
      </div>
    </div>
  );
}

function SuggestionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border bg-card hover:bg-accent px-3 h-9 text-sm font-medium"
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
            <ProductImage sku={product.sku} name={product.name} className="shrink-0 w-32 h-32" iconSize="text-5xl" />

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

  function submit() {
    if (cart.items.length === 0) return;
    const created = orders.createFromCart(cart.items);
    cart.clear();
    onClose();
    if (created.tier === "auto") toast.success(`${created.id} sent to supplier`);
    else if (created.tier === "pm") toast.success(`${created.id} sent to ${PM.name} for approval`);
    else toast.success(`${created.id} sent to ${CENTRAL.name} for approval`);
    navigate({ to: "/orders" });
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

export type {};

function ProductImage({
  sku,
  name,
  className = "",
  iconSize = "text-4xl",
}: {
  sku: string;
  name: string;
  className?: string;
  iconSize?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`bg-muted/50 rounded grid place-items-center ${iconSize} ${className}`}>
        📦
      </div>
    );
  }
  return (
    <img
      src={`/products/${sku}.jpg`}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover rounded bg-muted/50 ${className}`}
    />
  );
}
