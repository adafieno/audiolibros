import { useState, useEffect } from 'react';

type VariantSpec = { name: string; width: number; height: number; mime: string; quality?: number };

export type ImageSelectorWebProps = {
  value?: string;
  onChange: (url: string | undefined) => void;
  onUpload?: (variants: { name: string; blob: Blob }[]) => Promise<string | void>;
  imageStyle?: React.CSSProperties;
  hideButtons?: boolean;
};

const VARIANTS: VariantSpec[] = [
  { name: 'cover_3000x3000.png', width: 3000, height: 3000, mime: 'image/png' },
  { name: 'cover_2400x2400.jpg', width: 2400, height: 2400, mime: 'image/jpeg', quality: 0.9 },
  { name: 'cover_1400x1400.jpg', width: 1400, height: 1400, mime: 'image/jpeg', quality: 0.9 },
  { name: 'cover_600x600.jpg', width: 600, height: 600, mime: 'image/jpeg', quality: 0.9 },
];

export function ImageSelectorWeb({ value, onChange, onUpload, imageStyle, hideButtons = false }: ImageSelectorWebProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setPreviewUrl(value || null);
  }, [value]);

  const handleFileInput = async (file: File) => {
    try {
      setLoading(true);
      setError('');
      const fileUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = fileUrl;
      await img.decode();

      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const isValidSize = w >= 2000 && w <= 4000 && h >= 2000 && h <= 4000;
      if (!isValidSize) {
        setError(`Image dimensions: ${w}×${h}. Recommended: 3000×3000 (accepted 2000-4000px).`);
      }

      const variants: { name: string; blob: Blob }[] = [];
      for (const v of VARIANTS) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = v.width;
          canvas.height = v.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas not available');
          const srcW = img.naturalWidth;
          const srcH = img.naturalHeight;
          const srcSize = Math.min(srcW, srcH);
          const sx = Math.floor((srcW - srcSize) / 2);
          const sy = Math.floor((srcH - srcSize) / 2);
          ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, v.width, v.height);
          const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), v.mime, v.quality));
          variants.push({ name: v.name, blob });
        } catch (err) {
          console.warn('Variant generation failed for', v.name, err);
        }
      }

      let finalUrl: string | undefined = fileUrl;
      if (onUpload) {
        const uploadedBaseUrlOrVoid = await onUpload(variants);
        if (typeof uploadedBaseUrlOrVoid === 'string') {
          finalUrl = uploadedBaseUrlOrVoid;
        }
      }

      setPreviewUrl(finalUrl || fileUrl);
      onChange(finalUrl || fileUrl);
    } catch (err) {
      console.error('Image selection failed', err);
      setError('Failed to process image');
    } finally {
      setLoading(false);
    }
  };

  const onSelectClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void handleFileInput(file);
    };
    input.click();
  };

  const onRemove = () => {
    setPreviewUrl(null);
    onChange(undefined);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {previewUrl ? (
        <div style={{ position: 'relative', width: 200, height: 200, border: '1px solid #ccc', borderRadius: 4, overflow: 'hidden', ...imageStyle }}>
          <img src={previewUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: 'var(--panel)' }} />
          {!hideButtons && (
            <button onClick={onRemove} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', color: 'white', border: 'none', borderRadius: 2, padding: '2px 6px', fontSize: 12, cursor: 'pointer' }}>×</button>
          )}
        </div>
      ) : null}

      {!hideButtons && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={onSelectClick} disabled={loading} style={{ padding: '6px 10px' }}>{loading ? 'Loading…' : (value ? 'Change Cover' : 'Select Cover')}</button>
          {value && (
            <button onClick={onRemove} style={{ padding: '6px 10px' }}>Remove</button>
          )}
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--error)', fontSize: 12 }}>{error}</div>
      )}
    </div>
  );
}
