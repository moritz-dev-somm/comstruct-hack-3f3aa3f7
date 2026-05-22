import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getVapiVoiceConfig } from "@/lib/vapi.functions";

export type VapiState = "idle" | "connecting" | "listening" | "speaking" | "ending";

export type VapiTranscriptEvent =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string };

type Listener = (e: VapiTranscriptEvent) => void;

/**
 * Live voice mode powered by Vapi. The SDK is loaded lazily so the
 * ~250KB blob never ships to users who don't open voice mode.
 */
export function useVapiVoice({
  onTranscript,
  onError,
}: {
  onTranscript?: Listener;
  onError?: (msg: string) => void;
} = {}) {
  const fetchConfig = useServerFn(getVapiVoiceConfig);
  const [state, setState] = useState<VapiState>("idle");
  const [volume, setVolume] = useState(0);
  const vapiRef = useRef<unknown>(null);

  const stop = useCallback(async () => {
    const v = vapiRef.current as { stop?: () => void } | null;
    if (v?.stop) {
      try { v.stop(); } catch { /* noop */ }
    }
    setState("idle");
    setVolume(0);
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    setState("connecting");
    try {
      const cfg = await fetchConfig();
      const mod = await import("@vapi-ai/web");
      const Vapi = (mod as { default: new (key: string) => unknown }).default;
      const vapi = new Vapi(cfg.publicKey) as {
        start: (a: unknown) => Promise<unknown>;
        stop: () => void;
        on: (event: string, cb: (...args: unknown[]) => void) => void;
      };
      vapiRef.current = vapi;

      vapi.on("call-start", () => setState("listening"));
      vapi.on("call-end", () => {
        setState("idle");
        setVolume(0);
      });
      vapi.on("speech-start", () => setState("speaking"));
      vapi.on("speech-end", () => setState("listening"));
      vapi.on("volume-level", (lvl) => {
        if (typeof lvl === "number") setVolume(lvl);
      });
      vapi.on("error", (err) => {
        console.error("Vapi error", err);
        const msg = (err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Voice session error");
        onError?.(msg);
        setState("idle");
      });
      vapi.on("message", (raw) => {
        const m = raw as {
          type?: string;
          role?: string;
          transcriptType?: string;
          transcript?: string;
        };
        if (m?.type === "transcript" && m.transcriptType === "final" && m.transcript) {
          if (m.role === "user") {
            onTranscript?.({ role: "user", text: m.transcript });
          } else if (m.role === "assistant") {
            onTranscript?.({ role: "assistant", text: m.transcript });
          }
        }
      });

      await vapi.start(cfg.assistant);
    } catch (err) {
      console.error("Vapi start failed", err);
      onError?.(err instanceof Error ? err.message : "Could not start voice mode");
      setState("idle");
    }
  }, [fetchConfig, onError, onTranscript, state]);

  useEffect(() => {
    return () => {
      const v = vapiRef.current as { stop?: () => void } | null;
      if (v?.stop) try { v.stop(); } catch { /* noop */ }
    };
  }, []);

  return { state, volume, start, stop };
}
