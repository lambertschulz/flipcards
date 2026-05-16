import { compressImage, fitMaxEdge } from "@/lib/image/compress";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("fitMaxEdge", () => {
  it("returns dimensions unchanged when both edges are within the max", () => {
    expect(fitMaxEdge(1200, 800, 1600)).toEqual({ width: 1200, height: 800, scaled: false });
  });

  it("scales by the longer (landscape) edge", () => {
    expect(fitMaxEdge(3200, 1600, 1600)).toEqual({ width: 1600, height: 800, scaled: true });
  });

  it("scales by the longer (portrait) edge", () => {
    expect(fitMaxEdge(1000, 4000, 1600)).toEqual({ width: 400, height: 1600, scaled: true });
  });

  it("treats a square at the limit as unscaled", () => {
    expect(fitMaxEdge(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600, scaled: false });
  });

  it("rounds non-integer scaled edges", () => {
    const result = fitMaxEdge(1601, 1200, 1600);
    expect(result.width).toBe(1600);
    expect(Number.isInteger(result.height)).toBe(true);
    expect(result.scaled).toBe(true);
  });
});

/**
 * Browser primitives `compressImage` depends on:
 *   - `createImageBitmap` — jsdom doesn't ship it.
 *   - `HTMLCanvasElement.getContext('2d')` and `.toBlob` — jsdom returns null / no-ops.
 * We stub both globally for the duration of each test.
 */

type FakeBitmap = { width: number; height: number; close?: () => void };

function stubBitmap(bitmap: FakeBitmap) {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => bitmap),
  );
}

function stubCanvas(toBlob: (type: string, quality: number | undefined) => Blob) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage: () => undefined }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
    type,
    quality,
  ) {
    queueMicrotask(() => callback(toBlob(type ?? "image/png", quality ?? undefined)));
  });
}

function blob(size: number, type: string): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("compressImage", () => {
  it("passes GIFs through unchanged (preserves animation)", async () => {
    const input = blob(500_000, "image/gif");
    const result = await compressImage(input);
    expect(result.blob).toBe(input);
    expect(result.originalSize).toBe(500_000);
    expect(result.compressedSize).toBe(500_000);
    expect(result.dataUrl.startsWith("data:image/gif;base64,")).toBe(true);
  });

  it("re-encodes photos as JPEG q0.8 within the 1600 px envelope", async () => {
    stubBitmap({ width: 3200, height: 1600 });
    const encoded: Array<{ type: string; quality: number | undefined }> = [];
    stubCanvas((type, quality) => {
      encoded.push({ type, quality });
      return blob(180_000, type);
    });

    const input = blob(2_500_000, "image/jpeg");
    const result = await compressImage(input);
    expect(encoded).toEqual([{ type: "image/jpeg", quality: 0.8 }]);
    expect(result.originalSize).toBe(2_500_000);
    expect(result.compressedSize).toBe(180_000);
  });

  it("passes small PNGs through unchanged when no scaling is needed", async () => {
    stubBitmap({ width: 800, height: 600 });
    stubCanvas(() => blob(0, "image/jpeg"));
    const input = blob(50_000, "image/png");
    const result = await compressImage(input);
    expect(result.blob).toBe(input);
    expect(result.compressedSize).toBe(50_000);
  });

  it("keeps PNG when JPEG re-encode is not clearly smaller (> 70 % of PNG)", async () => {
    stubBitmap({ width: 1200, height: 800 });
    stubCanvas((type) => {
      // 240 KB PNG, 200 KB JPEG → JPEG is 83 % of PNG → keep PNG.
      if (type === "image/png") return blob(240_000, "image/png");
      return blob(200_000, "image/jpeg");
    });
    const input = blob(240_000, "image/png");
    const result = await compressImage(input);
    expect(result.blob.type).toBe("image/png");
  });

  it("switches PNG to JPEG when JPEG is < 70 % of the PNG and PNG > 200 KB", async () => {
    stubBitmap({ width: 1200, height: 800 });
    stubCanvas((type) => {
      // 300 KB PNG, 100 KB JPEG → JPEG is 33 % → take JPEG.
      if (type === "image/png") return blob(300_000, "image/png");
      return blob(100_000, "image/jpeg");
    });
    const input = blob(300_000, "image/png");
    const result = await compressImage(input);
    expect(result.blob.type).toBe("image/jpeg");
    expect(result.compressedSize).toBe(100_000);
  });

  it("rescales oversized PNG before deciding format", async () => {
    stubBitmap({ width: 3200, height: 1600 });
    let rescaledPngSize = 0;
    stubCanvas((type) => {
      if (type === "image/png") {
        rescaledPngSize = 250_000;
        return blob(rescaledPngSize, "image/png");
      }
      return blob(50_000, "image/jpeg");
    });
    const input = blob(900_000, "image/png");
    const result = await compressImage(input);
    expect(result.blob.type).toBe("image/jpeg");
    expect(result.compressedSize).toBe(50_000);
    // Rescaled PNG was produced (input is oversized) and then beaten by JPEG.
    expect(rescaledPngSize).toBeGreaterThan(0);
  });
});
