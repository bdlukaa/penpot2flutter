import { isPluginToUiMessage, type ConversionMessage, type PluginToUiMessage } from "./shared/messages.js";
import type { GeneratedFile } from "./shared/ir.js";
import { APP_VERSION } from "./shared/version.js";
import hljs from "highlight.js/lib/core";
import dartLanguage from "highlight.js/lib/languages/dart";
import "./style.css";

hljs.registerLanguage("dart", dartLanguage);

const app = document.querySelector<HTMLElement>("#app");
if (app === null) {
  throw new Error("Missing plugin app root.");
}

let latestDart = "";
let cachedDesignSystemFiles: readonly GeneratedFile[] = [];

app.innerHTML = `
  <header>
    <p class="eyebrow">PENPOT TO FLUTTER <span class="version">v${APP_VERSION}</span></p>
    <h1>Selection export</h1>
    <p id="status" class="muted">Reading the current selection…</p>
    <p id="selection-progress" class="muted" aria-live="polite"></p>
  </header>
  <section id="design-system" aria-label="Design system statistics">
    <div class="design-system-heading"><h2>Design System</h2><button id="refresh-design-system" class="generated-file" type="button">Refresh Design System</button></div>
    <p id="index-status" class="muted" aria-live="polite">Waiting to index…</p>
    <dl>
      <div><dt>Token sets</dt><dd id="token-set-count">0</dd></div>
      <div><dt>Tokens</dt><dd id="token-count">0</dd></div>
      <div><dt>Themes</dt><dd id="token-theme-count">0</dd></div>
      <div><dt>Theme groups</dt><dd id="token-group-count">0</dd></div>
      <div><dt>Color bindings</dt><dd id="token-color-binding-count">0</dd></div>
      <div><dt>Spacing bindings</dt><dd id="token-spacing-binding-count">0</dd></div>
      <div><dt>Typography bindings</dt><dd id="token-typography-binding-count">0</dd></div>
      <div><dt>Radius bindings</dt><dd id="token-radius-binding-count">0</dd></div>
      <div><dt>Other bindings</dt><dd id="token-other-binding-count">0</dd></div>
    </dl>
    <p id="token-catalog-status" class="muted"></p>
  </section>
  <section id="empty-state" class="empty-state" hidden>
    <h2>Select a board, rectangle, or text layer</h2>
    <p>Generated Flutter code will update whenever the selection changes.</p>
  </section>
  <section id="result" hidden>
    <div class="toolbar">
      <strong id="selection-summary"></strong>
      <div class="toolbar-actions">
        <button id="copy" type="button" disabled>Copy Dart</button>
        <button id="download" type="button" disabled>Download Dart</button>
      </div>
    </div>
    <section id="generated-files" hidden aria-label="Generated Dart files">
      <h2>Generated files</h2>
      <div id="generated-file-list" class="generated-file-list"></div>
    </section>
    <pre id="dart-preview" class="code-preview" aria-label="Generated Dart"><code></code></pre>
    <textarea id="dart" class="copy-source" readonly hidden spellcheck="false" aria-label="Generated Dart"></textarea>
    <section id="assets" hidden>
      <h2>Assets</h2>
      <textarea id="pubspec-assets" readonly spellcheck="false" aria-label="Generated pubspec assets"></textarea>
      <div id="asset-download-list" class="generated-file-list" aria-label="Exported assets"></div>
    </section>
    <section id="diagnostics" hidden aria-live="polite">
      <h2>Conversion diagnostics</h2>
      <ul id="diagnostic-list"></ul>
    </section>
  </section>
`;

const emptyState = requiredElement<HTMLElement>("empty-state");
const result = requiredElement<HTMLElement>("result");
const status = requiredElement<HTMLElement>("status");
const summary = requiredElement<HTMLElement>("selection-summary");
const selectionProgress = requiredElement<HTMLElement>("selection-progress");
const dart = requiredElement<HTMLTextAreaElement>("dart");
const dartPreview = requiredElement<HTMLElement>("dart-preview");
const copy = requiredElement<HTMLButtonElement>("copy");
const download = requiredElement<HTMLButtonElement>("download");
const assets = requiredElement<HTMLElement>("assets");
const pubspecAssets = requiredElement<HTMLTextAreaElement>("pubspec-assets");
const assetDownloadList = requiredElement<HTMLElement>("asset-download-list");
const generatedFiles = requiredElement<HTMLElement>("generated-files");
const generatedFileList = requiredElement<HTMLElement>("generated-file-list");
const diagnostics = requiredElement<HTMLElement>("diagnostics");
const diagnosticList = requiredElement<HTMLUListElement>("diagnostic-list");
const tokenSetCount = requiredElement<HTMLElement>("token-set-count");
const tokenCount = requiredElement<HTMLElement>("token-count");
const tokenThemeCount = requiredElement<HTMLElement>("token-theme-count");
const tokenGroupCount = requiredElement<HTMLElement>("token-group-count");
const tokenCatalogStatus = requiredElement<HTMLElement>("token-catalog-status");
const indexStatus = requiredElement<HTMLElement>("index-status");
const refreshDesignSystem = requiredElement<HTMLButtonElement>("refresh-design-system");
const tokenColorBindingCount = requiredElement<HTMLElement>("token-color-binding-count");
const tokenSpacingBindingCount = requiredElement<HTMLElement>("token-spacing-binding-count");
const tokenTypographyBindingCount = requiredElement<HTMLElement>("token-typography-binding-count");
const tokenRadiusBindingCount = requiredElement<HTMLElement>("token-radius-binding-count");
const tokenOtherBindingCount = requiredElement<HTMLElement>("token-other-binding-count");

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(latestDart);
    copy.textContent = "Copied";
  } catch {
    dart.focus();
    dart.select();
    copy.textContent = "Select code to copy";
  }
});

refreshDesignSystem.addEventListener("click", () => {
  refreshDesignSystem.disabled = true;
  parent.postMessage({ source: "penpot-to-flutter", type: "refresh-design-system" }, "*");
});

download.addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([latestDart], { type: "text/x-dart" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = selectedFileName();
  link.click();
  URL.revokeObjectURL(url);
});

window.addEventListener("message", (event) => {
  if (isPluginToUiMessage(event.data)) {
    render(event.data);
  }
});

parent.postMessage({ source: "penpot-to-flutter", type: "request-conversion" }, "*");

function render(message: PluginToUiMessage): void {
  const renderStart = now();
  if (message.type === "design-system-index") {
    renderIndexState(message);
    measureUiRender(renderStart);
    return;
  }
  renderConversion(message);
  measureUiRender(renderStart);
}

function renderConversion(message: ConversionMessage): void {
  if (message.designSystemFiles !== undefined) cachedDesignSystemFiles = message.designSystemFiles;
  tokenSetCount.textContent = String(message.tokenCatalog.sets);
  tokenCount.textContent = String(message.tokenCatalog.tokens);
  tokenThemeCount.textContent = String(message.tokenCatalog.themes);
  tokenGroupCount.textContent = String(message.tokenCatalog.groups.length);
  tokenCatalogStatus.textContent = message.tokenCatalogDiagnostics.map((diagnostic) => `${diagnostic.severity.toUpperCase()}: ${diagnostic.message}`).join(" ");
  tokenColorBindingCount.textContent = String(message.tokenBindings.colors);
  tokenSpacingBindingCount.textContent = String(message.tokenBindings.spacing);
  tokenTypographyBindingCount.textContent = String(message.tokenBindings.typography);
  tokenRadiusBindingCount.textContent = String(message.tokenBindings.radius);
  tokenOtherBindingCount.textContent = String(message.tokenBindings.other);
  const hasSelection = message.result !== undefined && message.dart !== undefined;
  if (message.pending) {
    emptyState.hidden = message.selectionCount > 0;
    result.hidden = true;
    selectionProgress.textContent = selectionCountLabel(message.selectionCount);
    status.textContent = message.selectionCount === 0 ? "No layers selected" : "Selection updated; resolving design-system dependencies…";
    return;
  }
  emptyState.hidden = hasSelection;
  result.hidden = !hasSelection;

  if (!hasSelection) {
    status.textContent = "No layers selected";
    return;
  }

  status.textContent = "Generated from the current selection";
  selectionProgress.textContent = selectionCountLabel(message.selectionCount);
  summary.textContent = selectionCountLabel(message.selectionCount);
  renderGeneratedFiles(message.files, message.dart);
  assets.hidden = (message.pubspecAssets === undefined || message.pubspecAssets === "") && (message.exportedAssets?.length ?? 0) === 0;
  pubspecAssets.hidden = message.pubspecAssets === undefined || message.pubspecAssets === "";
  pubspecAssets.value = message.pubspecAssets ?? "";
  renderExportedAssets(message.exportedAssets ?? []);
  copy.disabled = false;
  copy.textContent = "Copy Dart";
  download.disabled = false;

  const conversionDiagnostics = message.result.diagnostics;
  diagnostics.hidden = conversionDiagnostics.length === 0;
  const grouped = new Map<string, Map<string, { readonly code: string; readonly message: string; count: number }>>();
  for (const diagnostic of conversionDiagnostics) {
    const byCode = grouped.get(diagnostic.severity) ?? new Map<string, { readonly code: string; readonly message: string; count: number }>();
    grouped.set(diagnostic.severity, byCode);
    const key = `${diagnostic.code}:${diagnostic.message}`;
    const current = byCode.get(key);
    if (current === undefined) byCode.set(key, { code: diagnostic.code, message: diagnostic.message, count: 1 });
    else current.count++;
  }
  const severityOrder = ["error", "warning", "info"];
  diagnosticList.replaceChildren(
    ...severityOrder.flatMap((severity) => {
      const entries = grouped.get(severity);
      if (entries === undefined) return [];
      const section = document.createElement("li");
      section.className = `diagnostic-section diagnostic-${severity}`;
      const heading = document.createElement("strong");
      heading.textContent = `${severity[0]!.toUpperCase()}${severity.slice(1)} (${entries.size})`;
      const details = document.createElement("ul");
      details.className = "diagnostic-details";
      details.replaceChildren(
        ...[...entries.values()].map(({ code, message, count }) => {
          const item = document.createElement("li");
          item.textContent = `[${code}] ${count === 1 ? message : `${message} (${count} occurrences)`}`;
          return item;
        }),
      );
      section.append(heading, details);
      return [section];
    }),
  );
}

function renderIndexState(message: Extract<PluginToUiMessage, { readonly type: "design-system-index" }>): void {
  const { index } = message;
  if (index.metadata !== undefined) {
    tokenSetCount.textContent = String(index.metadata.sets);
    tokenCount.textContent = String(index.metadata.tokens);
    tokenThemeCount.textContent = String(index.metadata.themes);
    tokenGroupCount.textContent = String(index.metadata.groups.length);
  }
  const percent = index.progress === undefined || index.progress.total === 0
    ? ""
    : ` ${Math.round(index.progress.processed / index.progress.total * 100)}%`;
  indexStatus.textContent = index.status === "indexing"
    ? `Indexing in background…${percent}`
    : index.status === "loading-metadata"
      ? "Reading design-system metadata…"
      : index.status === "ready"
        ? "Design system ready"
        : index.status === "error"
          ? "Design-system index unavailable; literal export remains available."
          : "Design-system index is stale";
  tokenCatalogStatus.textContent = [
    ...index.diagnostics.map((diagnostic) => `${diagnostic.severity.toUpperCase()}: ${diagnostic.message}`),
    ...(index.error === undefined ? [] : [index.error]),
  ].join(" ");
  refreshDesignSystem.disabled = index.status === "indexing" || index.status === "loading-metadata";
}

function renderExportedAssets(exported: ConversionMessage["exportedAssets"]): void {
  assetDownloadList.replaceChildren(
    ...(exported ?? []).map((asset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "generated-file";
      button.textContent = `Download ${asset.filename}`;
      button.addEventListener("click", () => {
        const content = asset.encoding === "base64" ? decodeBase64(asset.content) : asset.content;
        const blobContent = typeof content === "string" ? content : new Uint8Array(content).buffer as ArrayBuffer;
        const url = URL.createObjectURL(new Blob([blobContent], { type: assetMimeType(asset.type) }));
        const link = document.createElement("a");
        link.href = url;
        link.download = asset.filename.split("/").pop() ?? asset.filename;
        link.click();
        URL.revokeObjectURL(url);
      });
      return button;
    }),
  );
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function assetMimeType(type: "svg" | "png" | "jpg" | "webp"): string {
  return type === "svg" ? "image/svg+xml" : type === "jpg" ? "image/jpeg" : `image/${type}`;
}

function renderGeneratedFiles(files: readonly GeneratedFile[] | undefined, fallback: string): void {
  const selectionFiles = files?.length === 0 || files === undefined ? [{ path: "generated_widget.dart", source: fallback }] : files;
  const generated = [...selectionFiles, ...cachedDesignSystemFiles.filter((stable) => !selectionFiles.some((file) => file.path === stable.path))];
  generatedFiles.hidden = generated.length < 2;
  generatedFileList.replaceChildren(
    ...generated.map((file, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "generated-file";
      button.textContent = file.path;
      button.addEventListener("click", () => {
        for (const candidate of generatedFileList.querySelectorAll("button")) {
          candidate.classList.remove("selected");
        }
        button.classList.add("selected");
        renderDart(file.source);
      });
      if (index === 0) {
        button.classList.add("selected");
      }
      return button;
    }),
  );
  renderDart(generated[0].source);
}

function renderDart(source: string): void {
  latestDart = source;
  dart.value = source;
  dartPreview.querySelector("code")!.innerHTML = highlightDart(source);
}

function selectionCountLabel(count: number): string {
  return `${count} selected ${count === 1 ? "layer" : "layers"}`;
}

function selectedFileName(): string {
  const selected = generatedFileList.querySelector<HTMLButtonElement>(".selected")?.textContent;
  return selected?.split("/").pop() || "generated_widget.dart";
}

function highlightDart(source: string): string {
  return hljs.highlight(source, { language: "dart", ignoreIllegals: true }).value;
}

function now(): number {
  return typeof performance === "undefined" || typeof performance.now !== "function" ? Date.now() : performance.now();
}

function measureUiRender(started: number): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  try {
    performance.measure("penpot-index:ui-render", { start: started, end: now() });
  } catch {
    // Iframe telemetry is optional and must not interrupt rendering.
  }
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}
