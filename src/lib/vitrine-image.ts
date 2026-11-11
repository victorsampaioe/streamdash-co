/**
 * Remove only dark, opaque pixels connected to the image's outer edge.
 * This preserves dark details enclosed by the logo itself.
 */
export function clearOpaqueBlackEdges(rgba: Uint8ClampedArray, width: number, height: number): boolean {
  if (width < 2 || height < 2 || rgba.length < width * height * 4) return false;
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  const isBlack = (i: number) => {
    const j = i * 4;
    return rgba[j + 3] > 240 && rgba[j] <= 74 && rgba[j + 1] <= 74 && rgba[j + 2] <= 74;
  };
  // Preserve PNGs that already contain genuine alpha transparency. Removing
  // near-black pixels from them could erase intentional details in the logo.
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 250) return false;
  }
  // Only clean a uniformly opaque, near-black background touching the edges.
  if (corners.filter(isBlack).length < 3) return false;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let tail = 0, head = 0, changed = false;
  const enqueue = (i: number) => {
    if (i < 0 || i >= seen.length || seen[i] || !isBlack(i)) return;
    seen[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++];
    rgba[i * 4 + 3] = 0;
    changed = true;
    const x = i % width, y = Math.floor(i / width);
    if (x > 0) enqueue(i - 1);
    if (x < width - 1) enqueue(i + 1);
    if (y > 0) enqueue(i - width);
    if (y < height - 1) enqueue(i + width);
  }
  return changed;
}

export async function prepareTransparentLogo(src: string, enabled = true): Promise<string> {
  if (!src || !enabled) return src;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const width = img.naturalWidth, height = img.naturalHeight;
        if (!width || !height || width * height > 4_000_000) return resolve(src);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, width, height);
        if (!clearOpaqueBlackEdges(pixels.data, width, height)) return resolve(src);
        ctx.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
