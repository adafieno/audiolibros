import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import PlanBoard from "../features/plan/PlanBoard";
import type { JobEvent, PlanBuildPayload } from "../global";
import { useProject } from "../store/project";
import { rel } from "../lib/paths";

export default function PlanningPage({ onStatus }: { onStatus: (s: string) => void }) {
  const { t } = useTranslation();
  const root = useProject((s) => s.root);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    window.khipu?.onJob((data: JobEvent) => {
      if (data.event === "progress" && typeof data.pct === "number") {
        onStatus(t("status.progress", { pct: data.pct, note: data.note ?? "" }));
      } else if (data.event === "done") {
        onStatus(data.ok ? t("status.completed") : t("status.failed"));
        setRunning(false);
      }
    });
  }, [onStatus, t]);

  if (!root) return <div>{t("status.openProject")}</div>;

  const buildPlan = async () => {
    setRunning(true);
    onStatus(t("status.generating"));
    const payload: PlanBuildPayload = {
      projectRoot: root,
      chapterId: rel.chapterId,
      infile: rel.chapterTxt,
      out: rel.planJson,
      opts: { dossier: rel.dossier, "llm-attribution": "off", "max-kb": 48 },
    };
    await window.khipu!.call("plan:build", payload);
    setRunning(false);
    onStatus(t("status.planUpdated"));
  };

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        <button onClick={buildPlan} disabled={running}>
          {running ? t("plan.generating") : t("plan.regen")}
        </button>
      </div>
      <PlanBoard
        projectRoot={root}
        planRelPath={rel.planJson}
        chapterId={rel.chapterId}
        onOpenChapter={() => onStatus("Abre Manuscript en la barra para editar el texto.")}
        onRegenerate={buildPlan}
      />
    </>
  );
}
