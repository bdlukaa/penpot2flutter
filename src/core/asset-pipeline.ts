import type { Diagnostic, IrAsset, IrAssetType } from "../shared/ir.js";

export interface AssetCandidate {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly type: IrAssetType;
  readonly semanticName: string;
  readonly contentHash?: string;
  readonly dimensions?: { readonly width: number; readonly height: number };
}

export interface AssetRegistry {
  readonly assets: readonly IrAsset[];
  /** Maps source asset IDs (media IDs or vector node IDs) to the canonical asset ID. */
  readonly assetIds: Readonly<Record<string, string>>;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Builds a deterministic asset catalog. Candidates are sorted before names are
 * allocated, so a different traversal order cannot change collision suffixes.
 */
export function createAssetRegistry(candidates: readonly AssetCandidate[]): AssetRegistry {
  const diagnostics: Diagnostic[] = [];
  const unique = new Map<string, AssetCandidate>();
  for (const candidate of [...candidates].sort(compareCandidates)) {
    const identity = candidate.contentHash === undefined
      ? `${candidate.type}:${candidate.id}`
      : `${candidate.type}:hash:${candidate.contentHash}`;
    const existing = unique.get(identity);
    if (existing !== undefined) {
      if (candidate.id !== existing.id) {
        diagnostics.push({
          severity: "info",
          sourceId: candidate.sourceNodeId,
          code: "ASSET_DUPLICATE_DETECTED",
          message: `Asset "${candidate.semanticName}" is identical to ${existing.sourceNodeId} and reuses its exported file.`,
        });
      }
      continue;
    }
    unique.set(identity, candidate);
  }

  const allocated = [...unique.values()].sort(compareCandidates).map((candidate) => ({
    candidate,
    baseFilename: baseFilename(candidate),
  }));
  const counts = new Map<string, number>();
  const assets: IrAsset[] = [];
  for (const { candidate, baseFilename: base } of allocated) {
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    const filename = count === 1 ? base : addCollisionSuffix(base, count);
    if (count > 1) {
      diagnostics.push({
        severity: "warning",
        sourceId: candidate.sourceNodeId,
        code: "ASSET_NAME_COLLISION",
        message: `Asset name "${base}" collides with another asset; exported as "${filename}".`,
      });
    }
    assets.push({
      id: candidate.id,
      sourceNodeId: candidate.sourceNodeId,
      type: candidate.type,
      filename,
      ...(candidate.contentHash === undefined ? {} : { contentHash: candidate.contentHash }),
      ...(candidate.dimensions === undefined ? {} : { dimensions: candidate.dimensions }),
    });
  }

  const canonicalById = new Map(assets.map((asset) => [asset.id, asset.id]));
  for (const candidate of candidates) {
    const identity = candidate.contentHash === undefined
      ? `${candidate.type}:${candidate.id}`
      : `${candidate.type}:hash:${candidate.contentHash}`;
    const canonical = unique.get(identity);
    if (canonical !== undefined) canonicalById.set(candidate.id, canonical.id);
  }
  return {
    assets,
    assetIds: Object.fromEntries([...canonicalById].sort(([left], [right]) => left.localeCompare(right))),
    diagnostics,
  };
}

export function assetForId(registry: AssetRegistry | readonly IrAsset[], id: string): IrAsset | undefined {
  if ("assetIds" in registry) {
    const canonicalId = registry.assetIds[id] ?? id;
    return registry.assets.find((asset) => asset.id === canonicalId);
  }
  return registry.find((asset) => asset.id === id);
}

export function assetTypeForMimeType(mimeType: string | undefined): IrAssetType {
  switch (mimeType?.toLowerCase()) {
    case "image/svg+xml": return "svg";
    case "image/jpeg":
    case "image/jpg": return "jpg";
    case "image/webp": return "webp";
    case "font/ttf":
    case "font/otf":
    case "font/woff":
    case "font/woff2": return "font";
    default: return "png";
  }
}

export function contentHashOf(data: readonly number[] | Uint8Array): string {
  // FNV-1a is deliberately small and deterministic in both the plugin and
  // test runtimes. It is an identity key, not a security checksum.
  let hash = 2166136261;
  for (const byte of data) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function compareCandidates(left: AssetCandidate, right: AssetCandidate): number {
  return left.sourceNodeId.localeCompare(right.sourceNodeId)
    || left.id.localeCompare(right.id)
    || left.type.localeCompare(right.type)
    || left.semanticName.localeCompare(right.semanticName);
}

function baseFilename(candidate: AssetCandidate): string {
  const segments = candidate.semanticName.split(/[\\/]/).map((segment) => segment.trim()).filter(Boolean);
  const first = segments[0]?.toLowerCase() ?? "";
  const category = candidate.type === "font"
    ? "fonts"
    : candidate.type === "svg"
      ? first === "icon" || first === "icons" || first === "glyph" || first === "glyphs" ? "icons" : "vectors"
      : "images";
  const leaf = segments[segments.length - 1] ?? candidate.id;
  const sourceExtension = leaf.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
  const slug = slugify(leaf.replace(/\.[A-Za-z0-9]+$/, "")) || slugify(candidate.id) || "asset";
  const cleaned = category === "images" ? slug.replace(/(?:-)?(?:image|photo|picture)$/i, "") || slug : slug;
  const extension = candidate.type === "svg" ? "svg" : candidate.type === "jpg" ? "jpg" : candidate.type === "font" ? sourceExtension ?? "font" : candidate.type;
  return `assets/${category}/${cleaned}.${extension}`;
}

function slugify(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function addCollisionSuffix(filename: string, count: number): string {
  const extensionIndex = filename.lastIndexOf(".");
  return extensionIndex < 0
    ? `${filename}-${count}`
    : `${filename.slice(0, extensionIndex)}-${count}${filename.slice(extensionIndex)}`;
}