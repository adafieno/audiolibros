import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../store/project";

type RecentItem = { path: string; name: string };

export default function Home() {
  const nav = useNavigate();
  const setRoot = useProject((s) => s.setRoot);

  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Create form state
  const [parentDir, setParentDir] = useState<string>("");
  const [projName, setProjName] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const items = await window.khipu!.call("project:listRecents", undefined);
        setRecents(items);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function chooseExisting() {
    setMsg("");
    const picked = await window.khipu!.call("project:choose", undefined);
    if (!picked) return;
    await window.khipu!.call("project:open", { path: picked });
    setRoot(picked);
    nav("/project", { replace: true });
  }

  async function browseParent() {
    const parent = await window.khipu!.call("project:browseForParent", undefined);
    if (parent) setParentDir(parent);
  }

  async function createNew() {
    setMsg("");
    const name = projName.trim();
    if (!parentDir || !name) {
      setMsg("Selecciona una carpeta y un nombre.");
      return;
    }
    const res = (await window.khipu!.call("project:create", {
      parentDir,
      name,
    })) as { path?: string } | null;

    if (!res?.path) {
      setMsg("No se pudo crear el proyecto.");
      return;
    }

    await window.khipu!.call("project:open", { path: res.path });
    setRoot(res.path);
    setProjName("");
    setMsg("Proyecto creado ✔");
    nav("/project", { replace: true });
  }

  const disabledCreate = useMemo(() => !parentDir || !projName.trim(), [parentDir, projName]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Khipu Studio</h2>
      <p>Abre un proyecto existente o crea uno nuevo con la estructura recomendada.</p>

      {/* Open existing */}
      <section style={{ marginTop: 16 }}>
        <h3>Proyectos recientes</h3>
        {loading ? (
          <div style={{ color: "var(--muted)" }}>Cargando…</div>
        ) : recents.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>No hay proyectos recientes.</div>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "8px 0",
              display: "grid",
              gap: 8,
            }}
          >
            {recents.map((r) => (
              <li
                key={r.path}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.path}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    onClick={async () => {
                      await window.khipu!.call("project:open", { path: r.path });
                      setRoot(r.path);
                      nav("/project", { replace: true });
                    }}
                  >
                    Abrir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={chooseExisting}>
            Abrir otra carpeta…
          </button>
        </div>
      </section>

      {/* Create new */}
      <section style={{ marginTop: 24 }}>
        <h3>Crear nuevo proyecto</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 8,
            maxWidth: 820,
          }}
        >
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>Carpeta base</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
                placeholder="C:\\proyectos\\audio"
              />
              <button className="btn" onClick={browseParent}>
                Examinar…
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>Nombre del proyecto</label>
            <input
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              placeholder="mi_libro"
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={createNew} disabled={disabledCreate}>
            Crear proyecto
          </button>
          <span style={{ marginLeft: 12, color: "var(--muted)" }}>{msg}</span>
        </div>
        <details style={{ marginTop: 12 }}>
          <summary>Estructura que se creará</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>
{`analysis/chapters_txt/
dossier/
ssml/plans/
ssml/xml/
cache/tts/
audio/chapters/
audio/book/
exports/
project.khipu.json
book.meta.json
production.settings.json`}
          </pre>
        </details>
      </section>
    </div>
  );
}
