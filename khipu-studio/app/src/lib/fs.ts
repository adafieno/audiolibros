import type { PlanFile } from "../types/plan";

export async function readJSON<T>(projectRoot: string, relPath: string): Promise<T | null> {
  const data = await window.khipu!.call("fs:read", { projectRoot, relPath, json: true });
  return (data ?? null) as T | null;
}

export async function writeJSON(projectRoot: string, relPath: string, content: unknown): Promise<boolean> {
  return window.khipu!.call("fs:write", { projectRoot, relPath, json: true, content });
}

export async function loadPlan(projectRoot: string, planRelPath: string) {
  return readJSON<PlanFile>(projectRoot, planRelPath);
}
export async function savePlan(projectRoot: string, planRelPath: string, plan: PlanFile) {
  return writeJSON(projectRoot, planRelPath, plan);
}
