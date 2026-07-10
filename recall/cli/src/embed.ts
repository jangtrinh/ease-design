/**
 * Local ONNX embeddings — the only model this workspace runs.
 *
 * Boundary invariant #4: embeddings are LOCAL by default. There is deliberately no
 * API-embedder path here; adding one is a conscious future change, not a flag that
 * quietly sends a project's design history over the network.
 *
 * The model id + dimensionality are pinned into the index header (see store.ts), so
 * an index can never silently mix embedding spaces. ONNX float output varies slightly
 * across architectures — which is exactly why the index is a rebuildable cache and
 * never a source of truth.
 */

/** Pinned model. Changing this invalidates every existing index (by design). */
export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const DIMS = 384;

type Extractor = (
  texts: string[],
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

let extractor: Promise<Extractor> | null = null;

/**
 * Load (and cache) the feature-extraction pipeline. The first call downloads the
 * model into the transformers cache; later calls are in-process.
 */
export async function getEmbedder(): Promise<Extractor> {
  if (extractor === null) {
    extractor = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return (await pipeline("feature-extraction", MODEL_ID)) as unknown as Extractor;
    })();
  }
  return extractor;
}

/**
 * Embed a batch of texts into unit-normalised vectors, one Float32Array per input,
 * in input order. Mean pooling + L2 normalisation is what all-MiniLM expects, and
 * normalising up front lets the vec0 distance behave like cosine similarity.
 */
export async function embedAll(texts: readonly string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const ex = await getEmbedder();
  const out = await ex([...texts], { pooling: "mean", normalize: true });
  const width = out.dims[1] ?? DIMS;
  if (width !== DIMS) {
    throw new Error(`embedder returned ${width}-dim vectors; expected ${DIMS} for ${MODEL_ID}`);
  }
  const vectors: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    // Copy out of the shared backing buffer — vec0 stores the bytes we hand it.
    vectors.push(Float32Array.from(out.data.subarray(i * width, (i + 1) * width)));
  }
  return vectors;
}

/** Embed a single query string. */
export async function embedOne(text: string): Promise<Float32Array> {
  const [v] = await embedAll([text]);
  if (v === undefined) throw new Error("embedder returned no vector");
  return v;
}
