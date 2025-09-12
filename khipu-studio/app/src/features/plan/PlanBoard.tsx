import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlanFile, PlanChunk } from "../../types/plan";
import { loadPlan, savePlan } from "../../lib/fs";

type Props = {
  projectRoot: string;
  planRelPath: string;          // "ssml/plans/ch01.plan.json"
  chapterId: string;            // e.g., "ch01"
  onOpenChapter: (chapterId: string) => void;
  onRegenerate: () => Promise<void>;
};

/* ---------- tiny type guards (no `any`) ---------- */
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}
function getString(obj: Record<string, unknown>, key: string, fallback = ""): string {
  const v = obj[key];
  return typeof v === "string" ? v : fallback;
}
function getBoolean(obj: Record<string, unknown>, key: string): boolean {
  return typeof obj[key] === "boolean" ? (obj[key] as boolean) : Boolean(obj[key]);
}
function getNullableString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}
function normalizePlan(raw: unknown): PlanFile | null {
  if (!isRecord(raw)) return null;

  const chapter_id = getString(raw, "chapter_id", "chapter");
  const chunksRaw = isRecord(raw) && Array.isArray(raw["chunks"]) ? (raw["chunks"] as unknown[]) : [];

  const chunks: PlanChunk[] = chunksRaw.map((c, i) => {
    if (!isRecord(c)) {
      return { id: `chunk_${i + 1}`, text: "", locked: false, sfxAfter: null };
    }
    return {
      id: getString(c, "id", `chunk_${i + 1}`),
      text: getString(c, "text", ""),
      locked: getBoolean(c, "locked"),
      sfxAfter: getNullableString(c, "sfxAfter"),
      // keep any provided source info if shape matches
      source: isRecord(c["source"])
        ? {
            chapter: getString(c["source"] as Record<string, unknown>, "chapter", chapter_id),
            start: typeof (c["source"] as Record<string, unknown>)["start"] === "number"
              ? ((c["source"] as Record<string, unknown>)["start"] as number)
              : undefined,
            end: typeof (c["source"] as Record<string, unknown>)["end"] === "number"
              ? ((c["source"] as Record<string, unknown>)["end"] as number)
              : undefined,
          }
        : undefined,
    };
  });

  return { chapter_id, chunks };
}

/* ---------- component ---------- */
export default function PlanBoard({ projectRoot, planRelPath, chapterId, onOpenChapter, onRegenerate }: Props) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<PlanFile | null>(null);
  const [msg, setMsg] = useState<string>("");

  // Load & normalize plan safely
  useEffect(() => {
    (async () => {
      try {
        setMsg(t("plan.loading"));
        const raw: unknown = await loadPlan(projectRoot, planRelPath);
        const norm = normalizePlan(raw);
        if (!norm) {
          setPlan(null);
          setMsg(t("status.planMissing"));
          return;
        }
        setPlan(norm);
        setMsg(t("status.planLoaded"));
      } catch (e) {
        console.error("[PlanBoard] load error", e);
        setPlan(null);
        setMsg(t("plan.loadError"));
      }
    })();
  }, [projectRoot, planRelPath, t]);

  const chunks = useMemo(() => plan?.chunks ?? [], [plan]);

  function toggleLock(chunk: PlanChunk) {
    if (!plan) return;
    const next: PlanFile = {
      ...plan,
      chunks: plan.chunks.map((c) => (c.id === chunk.id ? { ...c, locked: !c.locked } : c)),
    };
    setPlan(next);
  }

  async function saveAll() {
    if (!plan) return;
    setMsg(t("plan.saving"));
    await savePlan(projectRoot, planRelPath, plan);
    setMsg(t("plan.saved"));
  }

  async function regen() {
    setMsg(t("plan.generating"));
    await onRegenerate();             // parent calls plan:build
    const raw: unknown = await loadPlan(projectRoot, planRelPath);
    const norm = normalizePlan(raw);
    if (norm) {
      setPlan(norm);
      setMsg(t("plan.regenerated"));
    } else {
      setMsg(t("plan.regenerateFailed"));
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={saveAll} disabled={!plan}>Guardar plan</button>
        <button onClick={() => onOpenChapter(chapterId)}>Editar capítulo</button>
        <button onClick={regen}>Regenerar plan</button>
        <span style={{ color: "#9ca3af" }}>{msg}</span>
      </div>

      {!plan ? (
        <div style={{ marginTop: 12, color: "#fca5a5" }}>No hay plan para mostrar.</div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Capítulo: <code>{plan.chapter_id}</code> — Chunks: {plan.chunks.length}
          </div>

          <div
            style={{
              marginTop: 8,
              display: "grid",
              gridTemplateColumns: "140px 80px 1fr 200px",
              gap: 8,
              alignItems: "start",
            }}
          >
            <strong>ID</strong>
            <strong>Estado</strong>
            <strong>Texto (sólo lectura)</strong>
            <strong>Acciones</strong>

            {chunks.map((c) => (
              <Row key={c.id} chunk={c} onToggle={() => toggleLock(c)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ chunk, onToggle }: { chunk: PlanChunk; onToggle: () => void }) {
  const { t } = useTranslation();
  const text = typeof chunk.text === "string" ? chunk.text : "";
  const preview = text.length > 240 ? text.slice(0, 240) + "…" : text;
  return (
    <>
      <code>{chunk.id}</code>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={!!chunk.locked} onChange={onToggle} />
        {chunk.locked ? t("plan.locked") : t("plan.editable")}
      </label>
      <div style={{ whiteSpace: "pre-wrap" }}>{preview}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <button disabled title={t("plan.addSfx")}>SFX</button>
        <button disabled title={t("plan.goToText")}>Ir al texto</button>
      </div>
    </>
  );
}
