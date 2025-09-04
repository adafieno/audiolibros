import { useEffect, useMemo, useState } from "react";
import type { PlanFile, PlanChunk } from "../../types/plan";
import { loadPlan, savePlan } from "../../lib/fs";

type Props = {
  projectRoot: string;
  planRelPath: string; // e.g., "sample/ssml/plans/ch01.plan.json" or your selected project path
};

export default function PlanBoard({ projectRoot, planRelPath }: Props) {
  const [plan, setPlan] = useState<PlanFile | null>(null);
  const [editing, setEditing] = useState<PlanChunk | null>(null);
  const [msg, setMsg] = useState<string>("");

    useEffect(() => {
    (async () => {
        try {
        setMsg("Cargando plan…");
        const p = await loadPlan(projectRoot, planRelPath);
        setPlan(p);
        setMsg(p ? "Plan cargado" : "No se encontró el plan");
        } catch (e) {
        console.error('[PlanBoard] load error', e);
        setMsg("Error al cargar el plan");
        setPlan(null);
        }
    })();
    }, [projectRoot, planRelPath]);

  const chunks = useMemo(() => plan?.chunks ?? [], [plan]);

  function toggleLock(chunk: PlanChunk) {
    if (!plan) return;
    const next: PlanFile = {
      ...plan,
      chunks: plan.chunks.map((c) =>
        c.id === chunk.id ? { ...c, locked: !c.locked } : c
      ),
    };
    setPlan(next);
  }

  function startEdit(chunk: PlanChunk) {
    setEditing({ ...chunk });
  }

  function cancelEdit() {
    setEditing(null);
  }

  function commitEdit() {
    if (!plan || !editing) return;
    const next: PlanFile = {
      ...plan,
      chunks: plan.chunks.map((c) => (c.id === editing.id ? editing : c)),
    };
    setPlan(next);
    setEditing(null);
  }

  async function saveAll() {
    if (!plan) return;
    setMsg("Guardando…");
    await savePlan(projectRoot, planRelPath, plan);
    setMsg("Guardado ✔");
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={saveAll} disabled={!plan}>Guardar plan</button>
        <span style={{ color: "#9ca3af" }}>{msg}</span>
      </div>

      {!plan ? (
        <div style={{ marginTop: 12, color: "#fca5a5" }}>
          No hay plan para mostrar.
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Capítulo: <code>{plan.chapter_id}</code> — Chunks: {plan.chunks.length}
          </div>

          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "140px 80px 1fr 200px", gap: 8, alignItems: "start" }}>
            <strong>ID</strong>
            <strong>Estado</strong>
            <strong>Texto</strong>
            <strong>Acciones</strong>

            {chunks.map((c) => (
              <FragmentRow
                key={c.id}
                chunk={c}
                isEditing={editing?.id === c.id}
                editingValue={editing?.text ?? ""}
                onToggle={() => toggleLock(c)}
                onEdit={() => startEdit(c)}
                onChangeEdit={(t) => setEditing((e) => (e ? { ...e, text: t } : e))}
                onCancel={cancelEdit}
                onCommit={commitEdit}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentRow(props: {
  chunk: PlanChunk;
  isEditing: boolean;
  editingValue: string;
  onToggle: () => void;
  onEdit: () => void;
  onChangeEdit: (t: string) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const { chunk, isEditing, editingValue, onToggle, onEdit, onChangeEdit, onCancel, onCommit } = props;
  return (
    <>
      <code>{chunk.id}</code>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={!!chunk.locked} onChange={onToggle} />
        {chunk.locked ? "Bloqueado" : "Editable"}
      </label>
      <div>
        {isEditing ? (
          <textarea
            value={editingValue}
            onChange={(e) => onChangeEdit((e.target as HTMLTextAreaElement).value)}
            rows={4}
            style={{ width: "100%", padding: 8, color: "#111" }}
          />
        ) : (
          <div style={{ whiteSpace: "pre-wrap" }}>
            {chunk.text.length > 240 ? chunk.text.slice(0, 240) + "…" : chunk.text}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {isEditing ? (
          <>
            <button onClick={onCommit}>Aplicar</button>
            <button onClick={onCancel}>Cancelar</button>
          </>
        ) : (
          <>
            <button onClick={onEdit} disabled={!!chunk.locked}>Editar</button>
            <button title="(Próx.) Regenerar este chunk" disabled>Regenerar</button>
          </>
        )}
      </div>
    </>
  );
}
