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

/**
 * Validates image dimensions and format
 */
export function validateImage(file: File): Promise<{ valid: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/jpeg')) {
      resolve({ valid: false, error: 'File must be JPEG format' });
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (img.width === 3000 && img.height === 3000) {
        resolve({ valid: true });
      } else {
        resolve({ 
          valid: false, 
          error: `Image dimensions must be 3000×3000 pixels (current: ${img.width}×${img.height})` 
        });
      }
    };
    img.onerror = () => {
      resolve({ valid: false, error: 'Invalid image file' });
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Copies an image file to the project directory
 */
export async function copyImageToProject(
  projectRoot: string, 
  file: File, 
  fileName: string = 'cover.jpg'
): Promise<string | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    const success = await window.khipu!.call("fs:writeBinary", {
      projectRoot,
      relPath: fileName,
      content: Array.from(uint8Array)
    });
    
    return success ? fileName : null;
  } catch (error) {
    console.error('Error copying image to project:', error);
    return null;
  }
}

/**
 * Opens a file dialog to choose an image
 */
export async function chooseImageFile(): Promise<string | null> {
  return window.khipu!.call("file:chooseImage", undefined);
}
