import { createFileRoute } from "@tanstack/react-router";

// Construction-worker-ish gruff male voice (Brian). Override via body.voiceId.
const DEFAULT_VOICE_ID = "nPczCjzI2devNBz1zQrb";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          return Response.json(
            { error: "ELEVENLABS_API_KEY missing", fallback: true },
            { status: 200 },
          );
        }

        let body: { text?: string; voiceId?: string } = {};
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const text = (body.text ?? "").trim().slice(0, 4000);
        if (!text) {
          return Response.json({ error: "text is required" }, { status: 400 });
        }
        const voiceId = body.voiceId || DEFAULT_VOICE_ID;

        try {
          const upstream = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                text,
                model_id: "eleven_turbo_v2_5",
                voice_settings: {
                  stability: 0.45,
                  similarity_boost: 0.8,
                  style: 0.35,
                  use_speaker_boost: true,
                  speed: 1.0,
                },
              }),
            },
          );

          if (!upstream.ok || !upstream.body) {
            const errText = await upstream.text().catch(() => "");
            console.error("ElevenLabs TTS failed:", upstream.status, errText);
            return Response.json(
              {
                error: `ElevenLabs ${upstream.status}: ${errText.slice(0, 200)}`,
                fallback: upstream.status >= 500 || upstream.status === 401 || upstream.status === 429,
              },
              { status: 200 },
            );
          }

          return new Response(upstream.body, {
            status: 200,
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
            },
          });
        } catch (e) {
          console.error("TTS unexpected error:", e);
          return Response.json(
            { error: "TTS request failed", fallback: true },
            { status: 200 },
          );
        }
      },
    },
  },
});
