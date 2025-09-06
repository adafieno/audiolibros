import { useEffect, useMemo, useState } from "react";
import { useProject } from "../store/project";

type ChapterItem = {
  id: string;
  title: string;
  relPath: string;
  words: number;
};

export default function ManuscriptPage() {
  const root = useProject((s) => s.root);

  const [docx, setDocx] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [selected, setSelected] = useState<ChapterItem | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string>("");

  const canWork = useMemo(() => !!root, [root]);

  async function refreshList() {
    if (!root) return;
    const items = await window.khipu!.call("chapters:list", { projectRoot: root });
    setChapters(items);
    // auto-select first on refresh if none is selected
    if (items.length && !selected) {
      handleSelect(items[0]);
    } else if (!items.length) {
      setSelected(null);
      setText("");
    }
  }

  async function chooseDocxAndParse() {
    if (!root) return;
    const picked = await window.khipu!.call("manuscript:chooseDocx", undefined);
    if (!picked) return;
    setDocx(picked);
    setMsg("Procesando manuscrito…");
    const { code } = await window.khipu!.call("manuscript:parse", { projectRoot: root, docxPath: picked });
    if (code === 0) {
      setMsg("Listo ✔");
      await refreshList();
    } else {
      setMsg(`Error al procesar (código ${code})`);
    }
  }

  async function handleSelect(ch: ChapterItem) {
    if (!root) return;
    setSelected(ch);
    setMsg("Cargando capítulo…");
    const { text } = await window.khipu!.call("chapter:read", { projectRoot: root, relPath: ch.relPath });
    setText(String(text ?? ""));
    setMsg("");
  }

  async function saveChapter() {
    if (!root || !selected) return;
    setMsg("Guardando…");
    const ok = await window.khipu!.call("chapter:write", { projectRoot: root, relPath: selected.relPath, text });
    setMsg(ok ? "Guardado ✔" : "Error al guardar");
    // refresh word counts after save
    await refreshList();
  }

  useEffect(() => {
    // load chapter list when a project opens
    if (root) refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  if (!canWork) return <div>Abre un proyecto para gestionar el manuscrito.</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, height: "100%" }}>
      <aside style={{ borderRight: "1px solid var(--border)", paddingRight: 12, overflow: "auto" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button className="btn" onClick={chooseDocxAndParse}>Importar .docx…</button>
          <button className="btn" onClick={refreshList}>Refrescar</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{msg}</div>

        {chapters.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>
            No hay capítulos. Importa un .docx para generar la estructura.
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {chapters.map((c) => {
              const active = selected?.id === c.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => handleSelect(c)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: active ? "var(--panelAccent)" : "var(--panel)",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{c.title}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {c.id} · {c.words} palabras
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section style={{ display: "grid", gridTemplateRows: "auto 1fr auto", gap: 8, minHeight: 0 }}>
        <div>
          <h3 style={{ margin: 0 }}>
            {selected ? `${selected.title} (${selected.id})` : "Selecciona un capítulo"}
          </h3>
        </div>

        <div style={{ minHeight: 0 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Contenido del capítulo…"
            style={{
              width: "100%",
              height: "100%",
              minHeight: 0,
              resize: "none",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 14,
              background: "var(--panel)",
              color: "inherit",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 12,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" disabled={!selected} onClick={saveChapter}>Guardar capítulo</button>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>{msg}</span>
        </div>
      </section>
    </div>
  );
}
