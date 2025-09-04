import ChapterEditor from "../features/manuscript/ChapterEditor";
import { useProject } from "../store/project";
import { rel } from "../lib/paths";

export default function ManuscriptPage() {
  const root = useProject((s) => s.root);
  if (!root) return <div>Open a project from Home / Project.</div>;
  return (
    <ChapterEditor
      projectRoot={root}
      chapterRelPath={rel.chapterTxt}
      onSaved={() => {/* status is shown in header via App */}}
    />
  );
}
