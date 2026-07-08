// Node-side asset download (fonts + background images) into <slug>/capture/assets/.
// CORS-free fallback for URLs the in-page fetch couldn't inline. Track 5 Commit 3.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';

export interface DownloadedAsset { url: string; file: string; bytes: number }

/** Filesystem-safe unique filename derived from the URL (hash + extension). */
function fileNameFor(url: string): string {
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 12);
  let ext = '';
  try { ext = extname(new URL(url).pathname).slice(0, 6); } catch { /* no ext */ }
  if (!/^\.[a-z0-9]+$/i.test(ext)) ext = '';
  return `${hash}${ext}`;
}

/** Download up to `cap` unique URLs into destDir; skips failures. */
export async function downloadAssets(urls: string[], destDir: string, cap = 60): Promise<DownloadedAsset[]> {
  const unique = [...new Set(urls.filter((u) => /^https?:/i.test(u)))].slice(0, cap);
  if (unique.length === 0) return [];
  await mkdir(destDir, { recursive: true });
  const out: DownloadedAsset[] = [];
  for (const url of unique) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 64) continue; // skip empty/placeholder responses
      const file = fileNameFor(url);
      await writeFile(join(destDir, file), buf);
      out.push({ url, file, bytes: buf.byteLength });
    } catch { /* skip this asset */ }
  }
  return out;
}
