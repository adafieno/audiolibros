import { useState, useEffect } from 'react';
import { loadBookMeta } from '../lib/config';
import type { BookMeta } from '../types/config';

export function useBookMeta(root: string | undefined) {
  const [bookMeta, setBookMeta] = useState<BookMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!root) {
      setBookMeta(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const loadMeta = async () => {
      try {
        // Try to load from book.meta.json first
        const meta = await loadBookMeta(root, "book.meta.json");
        setBookMeta(meta);
      } catch (bookMetaError) {
        try {
          // Fallback: Try to load from project config
          const projectConfig = await window.khipu!.call("fs:read", {
            projectRoot: root,
            relPath: "project.khipu.json",
            json: true
          }) as { bookMeta?: BookMeta };
          
          if (projectConfig?.bookMeta) {
            setBookMeta(projectConfig.bookMeta);
          } else {
            setBookMeta(null);
          }
        } catch {
          console.warn("Failed to load book metadata:", bookMetaError);
          setBookMeta(null);
          setError("Failed to load book metadata");
        }
      } finally {
        setLoading(false);
      }
    };

    loadMeta();
  }, [root]);

  return { bookMeta, loading, error };
}