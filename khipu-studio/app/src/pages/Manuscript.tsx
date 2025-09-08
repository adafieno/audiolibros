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

  async function saveChapter() {
    if (!root || !selected) return;
    setMsg(t("manu.saving"));
    const ok = await window.khipu!.call("chapter:write", {
      projectRoot: root,
      relPath: selected.relPath,
      text,
    });
    setMsg(ok ? t("manu.saved") : t("manu.saveError"));
    if (ok) await refreshList(); // update word counts
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
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, height: "100%" }}>
        {/* Left: chapters */}
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

        {/* Right: editor */}
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
            <WorkflowCompleteButton 
              step="manuscript" 
              disabled={chapters.length === 0}
            >
              Marcar manuscrito como completo
            </WorkflowCompleteButton>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>{msg}</span>
          </div>
        </section>
      </div>
    </>
  );
}
