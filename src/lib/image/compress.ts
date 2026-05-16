// Image-compression pipeline per ADR-0013.
//
// Browser-only utility — uses `createImageBitmap` + `<canvas>` + `FileReader`,
// no external dependency. The card-editor calls this before embedding a Base64
// data: URI; the shared-deck import pipeline can call it to re-validate untrusted
// payloads (server-trust = 0).

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.8;
const PNG_RECOMPRESS_THRESHOLD_BYTES = 200 * 1024;
const JPEG_WIN_RATIO = 0.7;

export interface CompressResult {
  blob: Blob;
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
}

export async function compressImage(input: Blob): Promise<CompressResult> {
  const originalSize = input.size;

  // ADR-0013: GIFs pass through. Re-encoding via `<canvas>` would strip
  // animation; the per-card 5 MB cap is the only backstop here.
  if (input.type === "image/gif") {
    return finalize(input, originalSize);
  }

  const bitmap = await createImageBitmap(input);
  try {
    const { width, height, scaled } = fitMaxEdge(bitmap.width, bitmap.height, MAX_EDGE_PX);

    if (input.type === "image/png") {
      const pngBlob = scaled ? await rasterize(bitmap, width, height, "image/png") : input;
      if (pngBlob.size > PNG_RECOMPRESS_THRESHOLD_BYTES) {
        const jpegBlob = await rasterize(bitmap, width, height, "image/jpeg", JPEG_QUALITY);
        if (jpegBlob.size < pngBlob.size * JPEG_WIN_RATIO) {
          return finalize(jpegBlob, originalSize);
        }
      }
      return finalize(pngBlob, originalSize);
    }

    const jpegBlob = await rasterize(bitmap, width, height, "image/jpeg", JPEG_QUALITY);
    return finalize(jpegBlob, originalSize);
  } finally {
    bitmap.close?.();
  }
}

export function fitMaxEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; scaled: boolean } {
  if (width <= maxEdge && height <= maxEdge) {
    return { width, height, scaled: false };
  }
  const ratio = width >= height ? maxEdge / width : maxEdge / height;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
    scaled: true,
  };
}

async function rasterize(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  type: "image/jpeg" | "image/png",
  quality?: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))),
      type,
      quality,
    );
  });
}

async function finalize(blob: Blob, originalSize: number): Promise<CompressResult> {
  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    originalSize,
    compressedSize: blob.size,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}
