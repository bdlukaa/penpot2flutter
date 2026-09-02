const dartKeywords = new Set([
  "abstract", "as", "assert", "async", "await", "break", "case", "catch", "class", "const", "continue", "covariant", "default", "deferred", "do", "dynamic", "else", "enum", "export", "extends", "extension", "external", "factory", "false", "final", "finally", "for", "function", "get", "hide", "if", "implements", "import", "in", "interface", "is", "late", "library", "mixin", "new", "null", "on", "operator", "part", "required", "rethrow", "return", "set", "show", "static", "super", "switch", "sync", "this", "throw", "true", "try", "typedef", "var", "void", "while", "with", "yield",
]);

/** Converts one Penpot path segment into a legal, deterministic Dart identifier. */
export function dartIdentifierSegment(value: string, fallback = "token"): string {
  let source = value.trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  source = source.replace(/^-(\d+(?:\.\d+)?)$/, "negative$1");
  source = source.replace(/--(\d+(?:\.\d+)?)/g, "Negative$1");
  source = source.replace(/[-_\s]+(\d)/g, "$1");
  const parts = source.split(/[-_\s]+/).filter(Boolean);
  const result = parts.map((part, index) => {
    const normalized = part.replace(/[^A-Za-z0-9]/g, "");
    if (normalized === "") return "";
    return index === 0 ? normalized.charAt(0).toLowerCase() + normalized.slice(1) : normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }).join("");
  const legal = result === "" ? fallback : /^[A-Za-z_]/.test(result) ? result : `x${result}`;
  return dartKeywords.has(legal) ? `${legal}Value` : legal;
}

export function dartMemberName(value: string, fallback: string): string {
  return dartIdentifierSegment(value, fallback);
}

export function isDartIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) && !dartKeywords.has(value);
}

export function dartClassSegment(value: string): string {
  const member = dartIdentifierSegment(value, "Token");
  return member.charAt(0).toUpperCase() + member.slice(1);
}

/** Allocates identifiers in one namespace, treating case-only collisions as collisions too. */
export class DartSymbolAllocator {
  private readonly used = new Set<string>();

  constructor(names: Iterable<string> = []) {
    for (const name of names) this.used.add(name.toLowerCase());
  }

  allocate(value: string, fallback = "value"): string {
    const base = dartMemberName(value, fallback);
    let candidate = base;
    let suffix = 2;
    while (this.used.has(candidate.toLowerCase())) candidate = `${base}${suffix++}`;
    this.used.add(candidate.toLowerCase());
    return candidate;
  }
}
