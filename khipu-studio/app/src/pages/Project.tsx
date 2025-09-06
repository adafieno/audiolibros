// app/src/pages/Project.tsx
import { useEffect, useMemo, useState } from "react";
import { useProject } from "../store/project";
import {
  loadProjectConfig, saveProjectConfig,
  loadBookMeta,    saveBookMeta,
  loadProduction,  saveProduction,
} from "../lib/config";
import type { ProjectConfig } from "../types/config";
import type { BookMeta, ProductionSettings } from "../types/config";

type WithPaths = { paths?: { bookMeta?: string; production?: string } };

export default function ProjectPage() {
  // Mount log to confirm component is rendered
  console.log("[ProjectPage] mounted");
  const root = useProject((s) => s.root);


  const [cfg,  setCfg]  = useState<ProjectConfig | null>(null);
  const [book, setBook] = useState<BookMeta | null>(null);
  const [prod, setProd] = useState<ProductionSettings | null>(null);
  const [msg,  setMsg]  = useState("");
  const [err,  setErr]  = useState<string | null>(null);


  // 1) Load project.khipu.json when root changes
  useEffect(() => {
    let alive = true;
    (async () => {
      setErr(null);
      setBook(null);
      setProd(null);
      if (!root) { setCfg(null); return; }
      try {
        const pc = await loadProjectConfig(root);
        if (!alive) return;
        setCfg(pc);
      } catch (e) {
        if (!alive) return;
        setErr(`No se pudo cargar la configuración del proyecto: ${String(e)}`);
      }
    })();
    return () => { alive = false; };
  }, [root]);

  // Resolve relative JSON names once cfg exists
  const { bookRel, prodRel } = useMemo(() => {
    const p = (cfg as ProjectConfig & WithPaths) || ({} as ProjectConfig & WithPaths);
    return {
      bookRel: p.paths?.bookMeta ?? "book.meta.json",
      prodRel: p.paths?.production ?? "production.settings.json",
    };
  }, [cfg]);

  // 2) After cfg, load book.meta.json + production.settings.json
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!root || !cfg) return;
      setErr(null);
      try {
        const [b, pr] = await Promise.all([
          loadBookMeta(root, bookRel),
          loadProduction(root, prodRel),
        ]);
        if (!alive) return;
        setBook(b);
        setProd(pr);
      } catch (e) {
        if (!alive) return;
        setErr(`No se pudo cargar metadata/producción: ${String(e)}`);
      }
    })();
    return () => { alive = false; };
  }, [root, cfg, bookRel, prodRel]);

  if (!root) return <div>Abre un proyecto.</div>;
  if (!cfg)  return <div>Cargando…</div>;



  async function saveAll() {
    if (!root || !cfg) return;
    setMsg("Guardando…");
    try {
      if (book) await saveBookMeta(root, bookRel, book);
      if (prod) await saveProduction(root, prodRel, prod);
      const ok = await saveProjectConfig(root, cfg);
      setMsg(ok ? "Guardado ✔" : "Error al guardar");
    } catch (e) {
      setMsg(`Error: ${String(e)}`);
    }
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <h2 style={{ marginTop: 0 }}>Configuración del proyecto</h2>

      {err && <div style={{ color: "#fca5a5", marginBottom: 12 }}>{err}</div>}

      {/* Libro (book.meta.json) */}
      <section style={{ marginTop: 24 }}>
        <h3>Libro (metadata)</h3>
        {book ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="Título" value={book.title}
              onChange={(e) => setBook({ ...book, title: e.target.value })} />
            <input placeholder="Subtítulo" value={book.subtitle ?? ""}
              onChange={(e) => setBook({ ...book, subtitle: e.target.value })} />
            <input placeholder="Autores (coma)" value={book.authors.join(", ")}
              onChange={(e) =>
                setBook({ ...book, authors: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })
              } />
            <input placeholder="Narradores (coma)" value={(book.narrators ?? []).join(", ")}
              onChange={(e) =>
                setBook({ ...book, narrators: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })
              } />
            <input placeholder="Idioma" value={book.language}
              onChange={(e) => setBook({ ...book, language: e.target.value })} />
            <input placeholder="Palabras clave (coma)" value={(book.keywords ?? []).join(", ")}
              onChange={(e) =>
                setBook({ ...book, keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })
              } />
            <input placeholder="Categorías (coma)" value={(book.categories ?? []).join(", ")}
              onChange={(e) =>
                setBook({ ...book, categories: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })
              } />
            <input placeholder="Editorial" value={book.publisher ?? ""}
              onChange={(e) => setBook({ ...book, publisher: e.target.value })} />
            <input placeholder="Fecha publicación (YYYY-MM-DD)" value={book.publication_date ?? ""}
              onChange={(e) => setBook({ ...book, publication_date: e.target.value })} />
            <input placeholder="Derechos" value={book.rights ?? ""}
              onChange={(e) => setBook({ ...book, rights: e.target.value })} />
            <input placeholder="Serie (nombre)" value={book.series?.name ?? ""}
              onChange={(e) => setBook({ ...book, series: { ...(book.series ?? {}), name: e.target.value } })}
            />
            <input placeholder="Serie (número)" value={String(book.series?.number ?? "")}
              onChange={(e) =>
                setBook({ ...book, series: { ...(book.series ?? {}), number: e.target.value ? Number(e.target.value) : null } })
              } />
            <input placeholder="SKU" value={book.sku ?? ""}
              onChange={(e) => setBook({ ...book, sku: e.target.value })} />
            <input placeholder="ISBN" value={book.isbn ?? ""}
              onChange={(e) => setBook({ ...book, isbn: e.target.value })} />
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={!!book.disclosure_digital_voice}
                onChange={(e) => setBook({ ...book, disclosure_digital_voice: e.target.checked })} />
              Divulgación “voz digital”
            </label>
            <textarea placeholder="Descripción" value={book.description ?? ""}
              onChange={(e) => setBook({ ...book, description: e.target.value })}
              style={{ gridColumn: "1 / span 2", minHeight: 120 }} />
          </div>
        ) : (
          <div style={{ color: "#9ca3af" }}>Cargando metadata…</div>
        )}
      </section>

      {/* Producción (production.settings.json) */}
      <section style={{ marginTop: 24 }}>
        <h3>Producción (audio/paquetes)</h3>
        {prod ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="SSML voz por defecto" value={prod.ssml.default_voice}
              onChange={(e) => setProd({ ...prod, ssml: { ...prod.ssml, default_voice: e.target.value } })} />
            <input placeholder="WPM" value={String(prod.ssml.wpm)}
              onChange={(e) => setProd({ ...prod, ssml: { ...prod.ssml, wpm: Number(e.target.value) || 0 } })} />
            <input placeholder="Max KB por solicitud" value={String(prod.ssml.max_kb_per_request)}
              onChange={(e) => setProd({ ...prod, ssml: { ...prod.ssml, max_kb_per_request: Number(e.target.value) || 0 } })} />
            <input placeholder="Gap entre trozos (ms)" value={String(prod.concat.gap_ms)}
              onChange={(e) => setProd({ ...prod, concat: { ...prod.concat, gap_ms: Number(e.target.value) || 0 } })} />
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={prod.enhance.enable_deesser}
                onChange={(e) => setProd({ ...prod, enhance: { ...prod.enhance, enable_deesser: e.target.checked } })} />
              De-esser
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={prod.enhance.enable_expander}
                onChange={(e) => setProd({ ...prod, enhance: { ...prod.enhance, enable_expander: e.target.checked } })} />
              Expander
            </label>
          </div>
        ) : (
          <div style={{ color: "#9ca3af" }}>Cargando producción…</div>
        )}
      </section>

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button className="btn" onClick={saveAll}>Guardar todo</button>
        <span style={{ color: "var(--muted)" }}>{msg}</span>
      </div>
    </div>
  );
}
