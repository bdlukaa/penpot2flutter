const dartKeywords = new Set([
  "abstract", "as", "assert", "async", "await", "break", "case", "catch", "class", "const", "continue", "covariant", "default", "deferred", "do", "dynamic", "else", "enum", "export", "extends", "extension", "external", "factory", "false", "final", "finally", "for", "function", "get", "hide", "if", "implements", "import", "in", "interface", "is", "late", "library", "mixin", "new", "null", "on", "operator", "part", "required", "rethrow", "return", "set", "show", "static", "super", "switch", "sync", "this", "throw", "true", "try", "typedef", "var", "void", "while", "with", "yield",
]);

/** Converts one Penpot path segment without erasing sign or lexical digits. */
export function dartIdentifierSegment(value: string, fallback = "token"): string {
  let source = value.trim();
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

export function dartClassSegment(value: string): string {
  const member = dartIdentifierSegment(value, "Token");
  return member.charAt(0).toUpperCase() + member.slice(1);
}
