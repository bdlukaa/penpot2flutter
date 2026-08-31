export function componentKey(libraryId: string | undefined, componentId: string): string {
  return `${libraryId ?? "local"}:${componentId}`;
}
