import { useEffect, useMemo, useState } from "react";
import type { JobEvent, PlanBuildPayload } from "./global";
import { useProject } from "./store/project";
import PlanBoard from "./features/plan/PlanBoard";

function join(...xs: string[]) { return xs.join("/").replace(/\/+/g, "/"); }

function ProjectGate() {
  const root = useProject((s) => s.root);
  const setRoot = useProject((s) => s.setRoot);
  return (
    <div style={{ padding: 24, fontFamily: "Segoe UI, system-ui, sans-serif", color: "#e5e7eb" }}>
      <h1 style={{ marginTop: 0 }}>Khipu Studio</h1>
      <p>Selecciona o crea una carpeta de proyecto local.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={async () => {
          const picked = await window.khipu!.call("project:choose", undefined as unknown as undefined);
          if (picked) setRoot(picked);
        }}>Elegir carpeta…</button>
        {root && <span>Actual: <code style={{ color: "#a7f3d0" }}>{root}</code></span>}
      </div>
    </div>
  );
}

export default function App() {
  const root = useProject((s) => s.root);
  const [running, setRunning] = useState(false);
  const [lastMsg, setLastMsg] = useState<string>("");
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [showBoard, setShowBoard] = useState(false);

  useEffect(() => {
    window.khipu?.onJob((data: JobEvent) => {
      setEvents((prev) => [...prev.slice(-200), data]);
      if (data.event === "progress" && typeof data.pct === "number") setLastMsg(`Progreso: ${data.pct}% ${data.note ?? ""}`.trim());
      else if (data.event === "output" && data.path) setLastMsg(`Plan creado: ${data.path}`);
      else if (data.event === "done") { setLastMsg(data.ok ? "Completado ✔" : "Falló ❌"); setRunning(false); }
    });
  }, []);

  // RELATIVE paths the IPC expects
  const rel = useMemo(() => ({
    infile: "analysis/chapters_txt/ch01.txt",
    out:    "ssml/plans/ch01.plan.json",
    dossier:"dossier",
  }), []);

  // Absolute paths for display only
  const abs = useMemo(() => {
    const base = root ?? "";
    const j = (...xs: string[]) => (base ? join(base, ...xs) : join(...xs));
    return {
      infile: j(rel.infile),
      out:    j(rel.out),
    };
  }, [root, rel]);

  async function runPlan() {
    if (!root) { setLastMsg("Selecciona primero una carpeta de proyecto."); return; }
    setRunning(true); setEvents([]); setLastMsg("Preparando…");

    const payload: PlanBuildPayload = {
      projectRoot: root,                 // <- add this
      chapterId: "ch01",
      // pass RELATIVE paths to IPC
      infile: rel.infile,
      out: rel.out,
      opts: { dossier: rel.dossier, "llm-attribution": "off", "max-kb": 48 },
    };

    try {
      await window.khipu!.call("plan:build", payload);
      setRunning(false);
      setLastMsg(`Plan listo: ${abs.out}`);
      setShowBoard(true);
    } catch (err) {
      setRunning(false);
      setLastMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!root) return <ProjectGate />;

  return (
    <div style={{ padding: 24, fontFamily: "Segoe UI, system-ui, sans-serif", color: "#e5e7eb" }}>
      <h1 style={{ marginTop: 0 }}>Khipu Studio</h1>
      <div>Proyecto: <code style={{ color: "#a7f3d0" }}>{root}</code></div>

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button onClick={runPlan} disabled={running}>{running ? "Generando…" : "Generar plan"}</button>
        <button onClick={() => setShowBoard(true)}>Abrir plan</button>
      </div>

      <div style={{ marginTop: 12, color: "#9ca3af" }}>
        Entrada: <code>{abs.infile}</code> — Salida: <code>{abs.out}</code>
      </div>

      <div style={{ marginTop: 20, padding: 12, background: "#111827", borderRadius: 8 }}>
        <strong>Estado:</strong> {lastMsg || "—"}
      </div>

      {showBoard && (
        <div style={{ marginTop: 16 }}>
          {/* hand RELATIVE path to PlanBoard */}
          <PlanBoard projectRoot={root} planRelPath={rel.out} />
        </div>
      )}

      <div style={{ marginTop: 12, padding: 12, background: "#0b1220", borderRadius: 8, maxHeight: 220, overflow: "auto" }}>
        <strong>Eventos (stream):</strong>
        <pre style={{ whiteSpace: "pre-wrap" }}>{events.map((e) => JSON.stringify(e)).join("\n")}</pre>
      </div>
    </div>
  );
}
