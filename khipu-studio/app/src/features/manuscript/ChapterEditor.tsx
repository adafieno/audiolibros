import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  projectRoot: string;
  chapterRelPath: string;      // "analysis/chapters_txt/ch01.txt"
  onSaved?: () => void;
};

export default function ChapterEditor({ projectRoot, chapterRelPath, onSaved }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      setMsg("Cargando capítulo…");
      const data = await window.khipu!.call("fs:read", {
        projectRoot,
        relPath: chapterRelPath,
        json: false,
      });
      if (typeof data === "string") {
        setText(data);
        setMsg("Capítulo cargado");
        setDirty(false);
      } else {
        setMsg("No se encontró el archivo del capítulo.");
      }
    })();
  }, [projectRoot, chapterRelPath]);

  async function save() {
    setMsg("Guardando…");
    const ok = await window.khipu!.call("fs:write", {
      projectRoot,
      relPath: chapterRelPath,
      json: false,
      content: text,
    });
    setMsg(ok ? t("manuscript.saved") : t("manuscript.saveError"));
    if (ok) { setDirty(false); onSaved?.(); }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={save} disabled={!dirty}>Guardar capítulo</button>
        <span style={{ color: "#9ca3af" }}>{msg}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <textarea
          value={text}
          onChange={(e) => { setText((e.target as HTMLTextAreaElement).value); setDirty(true); }}
          rows={24}
          style={{ width: "100%", padding: 12, color: "#111" }}
          spellCheck={false}
        />
      </div>
      <div style={{ marginTop: 6, color: "#9ca3af" }}>
        Caracteres: {text.length}
      </div>
    </div>
  );
}
