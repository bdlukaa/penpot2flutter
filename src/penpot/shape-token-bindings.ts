import type { PenpotSourceShape } from "../core/extractor.js";

/** Preserves non-enumerable Penpot proxy children while serializing token bindings. */
export function withTokenBindings(
  shape: PenpotSourceShape,
  bindings: Readonly<Record<string, string>>,
): PenpotSourceShape {
  const children = shape.children;
  return {
    ...shape,
    ...(children == null ? {} : { children }),
    tokenBindings: { ...bindings },
  };
}
