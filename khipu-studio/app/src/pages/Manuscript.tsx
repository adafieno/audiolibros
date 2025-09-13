import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { WorkflowCompleteButton } from "../components/WorkflowCompleteButton";

type ChapterItem = {
  id: string;
  title: string;
  relPath: string;
  words: number;
};

export default function ManuscriptPage() {
  const { t } = useTranslation();
  const root = useProject((s) => s.root);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [selected, setSelected] = useState<ChapterItem | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string>("");

  async function refreshList() {
    if (!root) return;
    setMsg("Cargando capítulos…");
    const items = await window.khipu!.call("chapters:list", { projectRoot: root });
    setChapters(items);
    setMsg("");
    // auto-select first if none
    if (items.length && !selected) {
      void handleSelect(items[0]);
    } else if (!items.length) {
      setSelected(null);
      setText("");
    }
  }

  async function chooseDocxAndParse() {
    if (!root) return;
    const picked = await window.khipu!.call("manuscript:chooseDocx", undefined);
    if (!picked) return;
    setMsg("Procesando manuscrito…");
    const res = await window.khipu!.call("manuscript:parse", {
      projectRoot: root,
      docxPath: picked,
    });
    if (res.code === 0) {
      setMsg("Listo ✔");
      await refreshList();
    } else {
      setMsg(`Error al procesar (código ${res.code})`);
    }
  }

  async function handleSelect(ch: ChapterItem) {
    if (!root) return;
    setSelected(ch);
    setMsg("Cargando capítulo…");
    const { text } = await window.khipu!.call("chapter:read", {
      projectRoot: root,
      relPath: ch.relPath,
    });
    setText(text ?? "");
    setMsg("");
  }

  useEffect(() => {
    if (root) void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  return (
    <>
      <div>
        <section style={{ marginTop: 16 }}>
          <h2>{t("manu.title")}</h2>
        </section>
        
        {/* Toolbar */}
        <section style={{ marginTop: 16, marginBottom: 16 }}>
          <div style={{ 
            display: "flex", 
            gap: 8, 
            alignItems: "center",
            padding: "8px 12px",
            backgroundColor: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "6px"
          }}>
            <button className="btn" onClick={chooseDocxAndParse}>{t("manuscript.importDocx")}</button>
            <button className="btn" onClick={refreshList}>{t("manuscript.refresh")}</button>
            <div style={{ width: "1px", height: "20px", backgroundColor: "var(--border)", margin: "0 4px" }}></div>
            <WorkflowCompleteButton 
              step="manuscript" 
              disabled={chapters.length === 0}
              className="btn"
            >
              Marcar manuscrito como completo
            </WorkflowCompleteButton>
            {msg && (
              <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: "auto" }}>{msg}</span>
            )}
          </div>
        </section>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, height: "100%" }}>
        {/* Left: chapters */}
        <aside style={{ borderRight: "1px solid var(--border)", padding: "0 16px 0 0", overflow: "auto" }}>

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

        {/* Right: preview */}
        <section style={{ minHeight: 0 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
              {selected ? `${selected.title} (${selected.id})` : "Selecciona un capítulo"}
            </div>
            
            <div style={{ flex: 1, padding: "12px", overflow: "auto" }}>
              {selected ? (
                <div style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text)", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                  {text || "Contenido del capítulo…"}
                </div>
              ) : (
                <div style={{ color: "var(--muted)", fontStyle: "italic" }}>
                  Selecciona un capítulo para ver su contenido
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
