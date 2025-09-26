import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import StandardButton from './StandardButton';

interface ImageSelectorProps {
  projectRoot: string;
  value?: string;
  onChange: (imagePath: string | undefined) => void;
  hideButtons?: boolean;
  imageStyle?: React.CSSProperties;
}

export function ImageSelector({ projectRoot, value, onChange, hideButtons = false, imageStyle }: ImageSelectorProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [variantUrls, setVariantUrls] = useState<string[]>([]);
  const [variantIndex, setVariantIndex] = useState(0);

  // helper for IPC calls
  const khipuCall = <T = unknown>(channel: string, payload?: unknown): Promise<T> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window.khipu as any).call(channel, payload) as Promise<T>;
  };

  const loadImagePreview = useCallback(async () => {
    if (!value) return;
    
    try {
      const result = await khipuCall<{ success?: boolean; dataUrl?: string; error?: string }>("file:getImageDataUrl", { projectRoot, fileName: value });
      if (result && result.success && result.dataUrl) {
        setImageDataUrl(result.dataUrl);
      } else {
        console.error("Failed to load image preview:", result?.error);
        setImageDataUrl(null);
      }
    } catch (err) {
      console.error("Error loading image preview:", err);
      setImageDataUrl(null);
    }
  }, [value, projectRoot]);

  // Load image preview when value changes
  useEffect(() => {
    if (value && projectRoot) {
      loadImagePreview();
    } else {
      setImageDataUrl(null);
    }
  }, [value, projectRoot, loadImagePreview]);

  const handleFileSelect = async () => {
    try {
      setLoading(true);
      setError("");

      // Step 1: Choose image file
      const filePath = await window.khipu!.call("file:chooseImage", undefined);
      if (!filePath) {
        setLoading(false);
        return;
      }

      console.log("Selected file path:", filePath);

      // Step 2: Copy image to project directory
      const result = await window.khipu!.call("file:validateAndCopyImage", {
        filePath,
        projectRoot
      });

      if (!result.success) {
        setError(result.error || t("image.errors.failedToCopy"));
        setLoading(false);
        return;
      }

      console.log("Image copied successfully:", result);

      // Step 3: Validate image dimensions using data URL
      if (!result.fileName) {
        setError(t("image.errors.failedToGetFilename"));
        setLoading(false);
        return;
      }

      const result2 = await khipuCall<{ success?: boolean; dataUrl?: string; error?: string }>("file:getImageDataUrl", { projectRoot, fileName: result.fileName });

      if (result2 && result2.success && result2.dataUrl) {
        const img = new Image();
        
        img.onload = () => {
          try {
            console.log("Image loaded, dimensions:", img.width, "x", img.height);
            
            // Flexible validation - accept images that are reasonably close to 3000x3000
            const isValidSize = (
              (img.width >= 2000 && img.width <= 4000) && 
              (img.height >= 2000 && img.height <= 4000)
            );
            
            if (!isValidSize) {
              setError(`Image dimensions: ${img.width}×${img.height}. Recommended: 3000×3000 pixels (accepting 2000-4000px range).`);
              setLoading(false);
              return;
            }

            // Success!
            // Show the uploaded image preview
            setImageDataUrl(result2.dataUrl || null);
            onChange(result.fileName);

            // Generate variants and show as carousel (3000x3000 PNG, 2400x2400 JPG)
            try {
              const srcImg = new Image();
              srcImg.src = result2.dataUrl!;
              srcImg.onload = async () => {
                const makeDataUrl = (w: number, h: number, mime: string, quality?: number) => {
                  const canvas = document.createElement('canvas');
                  canvas.width = w;
                  canvas.height = h;
                  const ctx = canvas.getContext('2d');
                  if (!ctx) throw new Error('Canvas not available');
                  const srcW = srcImg.naturalWidth;
                  const srcH = srcImg.naturalHeight;
                  const srcSize = Math.min(srcW, srcH);
                  const sx = Math.floor((srcW - srcSize) / 2);
                  const sy = Math.floor((srcH - srcSize) / 2);
                  ctx.drawImage(srcImg, sx, sy, srcSize, srcSize, 0, 0, w, h);
                  return canvas.toDataURL(mime, quality);
                };

                const variants = [
                  { rel: 'art/cover_3000x3000.png', w: 3000, h: 3000, mime: 'image/png', quality: undefined },
                  { rel: 'art/cover_2400x2400.jpg', w: 2400, h: 2400, mime: 'image/jpeg', quality: 0.9 },
                  { rel: 'art/cover_1400x1400.jpg', w: 1400, h: 1400, mime: 'image/jpeg', quality: 0.9 },
                  { rel: 'art/cover_600x600.jpg', w: 600, h: 600, mime: 'image/jpeg', quality: 0.9 }
                ];

                const urls: string[] = [];
                for (const v of variants) {
                  try {
                    const dataUrl = makeDataUrl(v.w, v.h, v.mime, v.quality as number | undefined);
                    urls.push(dataUrl);

                    // write binary to disk
                    const base = dataUrl.replace(/^data:[^;]+;base64,/, '');
                    const binStr = atob(base);
                    const len = binStr.length;
                    const arr = new Array<number>(len);
                    for (let i = 0; i < len; i++) arr[i] = binStr.charCodeAt(i);
                    // write binary via IPC
                    await khipuCall('fs:writeBinary', { projectRoot, relPath: v.rel, content: arr });
                  } catch (err) {
                    console.warn('Failed to create variant', v.rel, err);
                  }
                }
                setVariantUrls(urls);
                setVariantIndex(0);
              };
            } catch (err) {
              console.warn('Variant generation failed', err);
            }
            setLoading(false);
            
          } catch (err) {
            console.error("Error in image validation:", err);
            // Even if validation fails, keep the image
            setImageDataUrl(result2.dataUrl || null);
            onChange(result.fileName);
            setLoading(false);
          }
        };
        
        img.onerror = () => {
          console.error("Error loading image for validation");
          // Even if validation fails, keep the image
          setImageDataUrl(result2.dataUrl || null);
          onChange(result.fileName);
          setLoading(false);
        };
        
        // Load the image for validation
        img.src = result2.dataUrl;
      } else {
        // Fallback: just accept the image without preview
        onChange(result.fileName);
        setLoading(false);
      }
      
    } catch (err) {
      console.error("Error selecting image:", err);
      setError(t("image.errors.failedToSelect"));
      setLoading(false);
    }
  };

  const handleRemove = () => {
    onChange(undefined);
    setImageDataUrl(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>{t("book.coverImage.label")}</div>
      
      {variantUrls.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setVariantIndex(i => Math.max(0, i - 1))} disabled={variantIndex === 0}>◀</button>
          <div style={{ width: 200, height: 200, border: '1px solid #ccc', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={variantUrls[variantIndex]} alt={`Cover variant ${variantIndex+1}`} style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: 'var(--panel)' }} />
          </div>
          <button onClick={() => setVariantIndex(i => Math.min(variantUrls.length - 1, i + 1))} disabled={variantIndex === variantUrls.length - 1}>▶</button>
        </div>
      ) : imageDataUrl && (
        <div style={{ 
          position: "relative", 
          width: 200, 
          height: 200, 
          border: "1px solid #ccc",
          borderRadius: 4,
          overflow: "hidden",
          ...imageStyle
        }}>
          <img 
            src={imageDataUrl} 
            alt="Cover" 
            style={{ 
              width: "100%", 
              height: "100%", 
              objectFit: "contain",
              backgroundColor: "var(--panel)"
            }}
          />
          {!hideButtons && (
            <button
              onClick={handleRemove}
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                background: "rgba(0,0,0,0.7)",
                color: "white",
                border: "none",
                borderRadius: 2,
                padding: "2px 6px",
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              ×
            </button>
          )}
        </div>
      )}

      {!hideButtons && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StandardButton 
            onClick={handleFileSelect} 
            disabled={loading}
            loading={loading}
            variant="primary"
          >
            {loading 
              ? t("common.loading")
              : value 
                ? t("book.coverImage.change") 
                : t("book.coverImage.select")
            }
          </StandardButton>
          
          {value && (
            <StandardButton 
              onClick={handleRemove}
              variant="danger"
            >
              {t("book.coverImage.remove")}
            </StandardButton>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, color: "#666" }}>
        {t("book.coverImage.requirements")}
      </div>

      {error && (
        <div style={{ 
          color: "var(--error)", 
          fontSize: 12, 
          padding: 8, 
          backgroundColor: "var(--error-bg, #f8d7da)",
          border: "1px solid var(--error-border, #f5c6cb)",
          borderRadius: 4
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
