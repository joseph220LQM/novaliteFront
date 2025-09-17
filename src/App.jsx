import React, { useEffect, useRef, useState } from "react";

// Une base + path garantizando un solo slash
const joinURL = (base = "", path = "") =>
  `${String(base).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;

// App.jsx — FloatingAgendaWidget (Chat/Voz) con AudioWorklet, barge-in,
// TTS controlado, estilos pulidos y fixes de scroll + URLs para Railway.
export default function FloatingAgendaWidget({
  apiBase = import.meta?.env?.VITE_API_BASE ?? "http://localhost:4000",
  wsPath = "",                         // puede ser absoluto "wss://..." o "/ws"
  mode = "both",                       // "chat" | "voice" | "both"
  clientId,                            // estable; si no llega, se guarda en localStorage
  // etiquetas
  chatTitle = "AGENDA TU CITA POR CHAT",
  chatSubtitle = "Chat activo",
  voiceTitle = "AGENDA TU CITA POR VOZ",
  voiceSubtitle = "Pulsa el micrófono para iniciar",
  greeting = "¡Hola! Aquí podrás agendar tus citas en Cemdi para Famisanar. ¿Con quién estoy hablando?",
  // layout
  position = "bottom-right",
  zIndex = 50,
}) {
  // --- clientId estable
  const clientIdRef = useRef(null);
  if (!clientIdRef.current) {
    if (clientId) {
      clientIdRef.current = clientId;
    } else {
      const k = "novalite.clientId";
      const saved = typeof window !== "undefined" ? localStorage.getItem(k) : null;
      if (saved) {
        clientIdRef.current = saved;
      } else {
        const generated =
          (window.crypto?.randomUUID?.() ??
            `client-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        clientIdRef.current = generated;
        try { localStorage.setItem(k, generated); } catch {}
      }
    }
  }

  // --- layout / abrir-cerrar
  const [open, setOpen] = useState(false);
  const pos =
    position === "bottom-left" ? "left-4 bottom-4" :
    position === "top-right"   ? "right-4 top-4"   :
    position === "top-left"    ? "left-4 top-4"    :
                                 "right-4 bottom-4";

  // --- modo activo
  const [activeTab, setActiveTab] = useState(mode === "voice" ? "voice" : "chat");

  // ---------------- CHAT ----------------
  const [messages, setMessages] = useState([{ role: "assistant", text: greeting }]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const chatBodyRef = useRef(null);

  const resetChat = () => {
    setMessages([{ role: "assistant", text: greeting }]);
    setPrompt("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const sendPrompt = async () => {
    if (!prompt.trim() || loading) return;
    const userText = prompt.trim();
    setMessages((p) => [...p, { role: "user", text: userText }]);
    setPrompt("");
    try {
      setLoading(true);
      const res = await fetch(joinURL(apiBase, "/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userText }),
      });
      const data = await res.json();
      setMessages((p) => [
        ...p,
        { role: "assistant", text: data?.reply || "Lo siento, no hubo respuesta." },
      ]);
    } catch {
      setMessages((p) => [
        ...p,
        { role: "assistant", text: "❌ Error conectando con el servidor" },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  };

  // foco estable al abrir/cambiar a Chat
  useEffect(() => {
    if (open && activeTab === "chat") {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, activeTab]);

  // Auto-scroll al último mensaje cuando cambian los mensajes
  useEffect(() => {
    const el = chatBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Evita “saltos” mientras escribes: si estás cerca del fondo, mantente abajo
  useEffect(() => {
    const el = chatBodyRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [prompt, open, activeTab]);

  // ---------------- VOZ ----------------
  const wsRef = useRef(null);
  const mediaRef = useRef({ stream: null, workletNode: null, audioContext: null });
  const [listening, setListening] = useState(false);

  const audioRef = useRef(null);
  const ttsAbortRef = useRef(null);

  // Construye WS URL: si wsPath es absoluto (wss://...), úsalo tal cual.
  // Si no, deriva de apiBase (http(s) -> ws(s)) y únelos de forma segura.
  const WS_URL = (() => {
    if (wsPath && /^wss?:\/\//i.test(wsPath)) return wsPath;
    const wsBase = String(apiBase || "").replace(/^http(s?):\/\//i, (_, s) => `ws${s ? "s" : ""}://`);
    return joinURL(wsBase, wsPath || "/ws");
  })();

  const stopSpeak = async () => {
    try {
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort();
        ttsAbortRef.current = null;
      }
    } catch {}
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      const a = audioRef.current;
      try { a.pause(); } catch {}
      try {
        if (a.src && a.src.startsWith("blob:")) URL.revokeObjectURL(a.src);
        a.src = "";
      } catch {}
      fetch(joinURL(apiBase, "/speak/stop") + `?clientId=${clientIdRef.current}`, { method: "POST" }).catch(()=>{});
    } catch {}
  };

  const speak = async (text) => {
    if (!text || !text.trim()) return;
    await stopSpeak();
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      const ctrl = new AbortController();
      ttsAbortRef.current = ctrl;
      const res = await fetch(joinURL(apiBase, "/speak") + `?clientId=${clientIdRef.current}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = audioRef.current;
      try { if (a.src && a.src.startsWith("blob:")) URL.revokeObjectURL(a.src); } catch {}
      a.src = url;
      a.onended = () => { try { URL.revokeObjectURL(url); } catch {} };
      await a.play();
    } catch {}
  };

  const startRecording = async () => {
    if (wsRef.current) return;
    await stopSpeak();

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => setListening(true);
    ws.onclose = () => {
      setListening(false);
      wsRef.current = null;
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      // BARGE-IN: corta TTS al llegar un parcial
      if (data.transcript && data.isPartial) {
        stopSpeak();
      }
      // Reproducir respuesta sin mostrar texto
      if (data.bedrockReply) {
        await speak(data.bedrockReply);
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AC = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AC({ sampleRate: 44100 }); // Chrome puede ignorar 16k

    try {
      // AudioWorklet (latencia baja)
      await audioContext.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, "pcm-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
      });
      workletNode.port.onmessage = (e) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
      };
      source.connect(workletNode);
      mediaRef.current = { stream, workletNode, audioContext };
    } catch {
      // Fallback ScriptProcessorNode
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const ab = new ArrayBuffer(input.length * 2);
        const view = new DataView(ab);
        for (let i = 0; i < input.length; i++) {
          let s = Math.max(-1, Math.min(1, input[i]));
          view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        if (ws.readyState === WebSocket.OPEN) ws.send(ab);
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      mediaRef.current = { stream, workletNode: processor, audioContext };
    }
  };

  const stopRecording = () => {
    if (mediaRef.current?.stream) mediaRef.current.stream.getTracks().forEach((t) => t.stop());
    if (mediaRef.current?.workletNode) { try { mediaRef.current.workletNode.disconnect(); } catch {} }
    if (mediaRef.current?.audioContext) { try { mediaRef.current.audioContext.close(); } catch {} }
    mediaRef.current = { stream: null, workletNode: null, audioContext: null };
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
    setListening(false);
  };

  // Cambio de modo: corta llamada/tts y enfoca input
  const switchMode = (next) => {
    if (next === activeTab) return;
    if (activeTab === "voice") {
      stopRecording();
      stopSpeak();
    }
    setActiveTab(next);
    if (next === "chat") requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Cierre limpio al descargar la página
  useEffect(() => {
    const onUnload = () => { stopRecording(); stopSpeak(); };
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("beforeunload", onUnload); onUnload(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔁 Reiniciar en VOZ (como en chat)
  const resetVoice = () => {
    try { stopSpeak(); } catch {}
    try { stopRecording(); } catch {}
    // Si quieres que quede escuchando de inmediato:
    // setTimeout(() => startRecording(), 150);
  };

  // ----------- UI helpers -----------
  const FloatingToggle = () => (
    <div className="flex items-center gap-2 mt-2">
      <div className="relative w-[64px] h-9 bg-slate-200/80 rounded-full shadow-inner border border-slate-300/60">
        <button
          className={`cursor-pointer absolute top-[6px] left-[6px] w-[26px] h-[26px] rounded-full bg-white shadow transition-all ${
            activeTab === "chat" ? "translate-x-0" : "translate-x-[34px]"
          }`}
          onClick={() => switchMode(activeTab === "chat" ? "voice" : "chat")}
          aria-label="Cambiar Chat/Voz"
        />
      </div>
      <span className="text-xs text-slate-600">{activeTab === "chat" ? "Chat" : "Voz"}</span>
    </div>
  );

  const FloatingButton = ({ label }) => (
    <div className="flex flex-col items-end cursor-pointer">
      <button
        onClick={() => setOpen(true)}
        className="cursor-pointer flex items-center gap-3 bg-white/95 backdrop-blur rounded-full pl-3 pr-4 py-2 border border-slate-200 shadow-[0_6px_24px_-8px_rgba(0,0,0,0.20)] hover:shadow-[0_10px_30px_-8px_rgba(16,185,129,0.35)] transition"
      >
        <span className="w-5 h-5 shrink-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        <span className="text-[13px] font-semibold text-slate-900 tracking-wide uppercase">
          {label}
        </span>
      </button>
      <FloatingToggle />
    </div>
  );

  const Header = ({ title, subtitle, rightExtra }) => (
    <div className="cursor-default px-4 py-3 border-b border-slate-200/80 bg-white flex items-center gap-3">
      {/* acento lateral */}
      <div className="w-1 h-6 rounded-full bg-emerald-500" />
      <div className="flex-1">
        <div className="text-[12px] font-semibold text-slate-900 tracking-[0.06em] uppercase">
          {title}
        </div>
        <div className="text-[11px] text-slate-500 -mt-0.5">{subtitle}</div>
      </div>

      {/* pills Chat/Voz */}
      <div className="hidden sm:flex items-center bg-slate-100 rounded-full p-1">
        <button
          onClick={() => switchMode("chat")}
          className={`cursor-pointer text-xs px-3 py-1 rounded-full transition ${
            activeTab === "chat" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-white"
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => switchMode("voice")}
          className={`cursor-pointer text-xs px-3 py-1 rounded-full transition ${
            activeTab === "voice" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-white"
          }`}
        >
          Voz
        </button>
      </div>

      {/* extra (reiniciar) si se entrega */}
      {rightExtra}

      <button
        onClick={() => {
          if (activeTab === "voice") { stopRecording(); stopSpeak(); }
          setOpen(false);
        }}
        className="cursor-pointer text-slate-500 hover:text-slate-800 text-lg"
        title="Cerrar"
      >
        ✕
      </button>
    </div>
  );

  // ----------- Vistas -----------
  const ChatView = () => (
    <>
      <Header
        title={chatTitle}
        subtitle={chatSubtitle}
        rightExtra={
          <button
            onClick={resetChat}
            className="cursor-pointer text-xs px-2 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 mr-2"
            title="Reiniciar chat"
          >
            ↻ Reiniciar
          </button>
        }
      />

      <div
        ref={chatBodyRef}
        className="flex-1 p-3 overflow-y-auto bg-slate-50/70"
        style={{ overflowAnchor: "none", overscrollBehavior: "contain" }}
      >
        {messages.map((m, i) => (
          <div key={i} className={`mb-2 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`${
                m.role === "user"
                  ? "bg-emerald-600 text-white rounded-br-sm"
                  : "bg-white text-slate-900 border border-slate-200 rounded-bl-sm"
              } px-3 py-2 rounded-2xl max-w-[75%] whitespace-pre-wrap shadow-[0_3px_12px_-6px_rgba(0,0,0,0.20)]`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Footer del chat */}
      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <textarea
            ref={inputRef}
            autoFocus
            dir="ltr"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={(e) => {
              try { stopSpeak(); } catch {}
              const len = e.target.value.length;
              try { e.target.setSelectionRange(len, len); } catch {}
            }}
            onKeyDown={onKey}
            rows={1}
            placeholder="Escribe tu consulta para agendar cita…"
            className="flex-1 resize-none rounded-xl border border-slate-300/80 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white"
          />
          <button
            onClick={sendPrompt}
            disabled={loading}
            title="Enviar"
            className="cursor-pointer w-10 h-10 rounded-full grid place-items-center
                       bg-gradient-to-b from-emerald-500 to-emerald-600 text-white
                       shadow-[0_6px_20px_-6px_rgba(16,185,129,0.55)]
                       hover:brightness-105 disabled:opacity-50"
          >
            ➤
          </button>
        </div>
      </div>
    </>
  );

  const VoiceView = () => (
    <>
      <Header
        title={voiceTitle}
        subtitle={listening ? "Escuchando…" : voiceSubtitle}
        rightExtra={
          <button
            onClick={resetVoice}
            className="cursor-pointer text-xs px-2 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 mr-2"
            title="Reiniciar llamada"
          >
            ↻ Reiniciar
          </button>
        }
      />

      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/70 gap-3 p-4">
        {listening ? (
          <div className="w-28 h-16 rounded-xl bg-emerald-100/70 ring-1 ring-emerald-200 relative overflow-hidden flex items-center justify-center">
            <div className="w-2 h-8  bg-emerald-500/80 mx-1 animate-pulse" />
            <div className="w-2 h-12 bg-emerald-500/80 mx-1 animate-pulse" />
            <div className="w-2 h-16 bg-emerald-500/80 mx-1 animate-pulse" />
            <div className="w-2 h-12 bg-emerald-500/80 mx-1 animate-pulse" />
            <div className="w-2 h-8  bg-emerald-500/80 mx-1 animate-pulse" />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-full border border-slate-300/80 bg-white grid place-items-center text-slate-500 shadow-sm">
            🎤
          </div>
        )}
        {/* 🔇 NO mostramos texto en modo voz */}
      </div>

      <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-center gap-3">
        {listening ? (
          <>
            <button
              onClick={stopSpeak}
              className="cursor-pointer px-3 py-2 rounded-full bg-slate-800 text-white text-sm hover:bg-slate-900"
              title="Silenciar TTS"
            >
              🔇
            </button>
            <button
              onClick={stopRecording}
              className="cursor-pointer flex-1 max-w-[240px] px-5 py-3 rounded-full
                         bg-gradient-to-b from-rose-500 to-rose-600 text-white font-semibold
                         shadow-[0_8px_28px_-10px_rgba(244,63,94,0.55)] hover:brightness-105"
            >
              ■ Finalizar Llamada
            </button>
          </>
        ) : (
          <button
            onClick={startRecording}
            className="cursor-pointer flex-1 max-w-[260px] px-5 py-3 rounded-full
                       bg-gradient-to-b from-emerald-500 to-emerald-600 text-white font-semibold
                       shadow-[0_8px_28px_-10px_rgba(16,185,129,0.55)] hover:brightness-105"
          >
            <span className="mr-2">🎙️</span> Iniciar Llamada
          </button>
        )}
      </div>
    </>
  );

  // ----------- render principal -----------
  const label = activeTab === "voice" ? voiceTitle : chatTitle;

  return (
    <div className={`fixed ${pos}`} style={{ zIndex }}>
      {/* cursores por si Tailwind no está global */}
      <style>{`.cursor-pointer{cursor:pointer}.cursor-default{cursor:default}`}</style>

      {!open && <FloatingButton label={label} />}

      {open && (
        <div className="w-[380px] max-w-[94vw] h-[520px] bg-white text-slate-900 rounded-2xl shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] border border-slate-200 flex flex-col overflow-hidden">
          {activeTab === "voice" ? <VoiceView /> : <ChatView />}
        </div>
      )}
    </div>
  );
}



