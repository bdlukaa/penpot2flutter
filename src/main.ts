import { isPluginToUiMessage, type ConversionMessage, type HandoffBundle, type PluginToUiMessage } from "./shared/messages.js";
import type { Diagnostic, GeneratedArtifactTier, GeneratedFile, IrQualitySummary } from "./shared/ir.js";

declare const __PENPOT_TO_FLUTTER_VERSION__: string;

import hljs from "highlight.js/lib/core";
import dartLanguage from "highlight.js/lib/languages/dart";
import "./style.css";

hljs.registerLanguage("dart", dartLanguage);

const app = document.querySelector<HTMLElement>("#app");
if (app === null) {
  throw new Error("Missing plugin app root.");
}

type FileFilter = "all" | GeneratedArtifactTier;

let latestDart = "";
let latestHandoff: HandoffBundle | undefined;
let cachedDesignSystemFiles: readonly GeneratedFile[] = [];
let visibleFiles: readonly GeneratedFile[] = [];
let fallbackDart = "";
let activeFilter: FileFilter = "all";
let selectedFilePath = "";

app.innerHTML = `
  <header class="app-header">
    <div class="brand-row">
      <div class="brand-mark" aria-hidden="true">P</div>
      <div>
        <p class="eyebrow">PENPOT TO FLUTTER <span class="version">v${__PENPOT_TO_FLUTTER_VERSION__}</span></p>
        <h1>Design handoff</h1>
      </div>
      <span id="status-indicator" class="status-indicator" data-state="loading">Preparing</span>
    </div>
    <p id="status" class="status-copy" aria-live="polite">Reading the current selection…</p>
    <p id="selection-progress" class="selection-progress" aria-live="polite"></p>
  </header>

  <section id="empty-state" class="empty-state" hidden>
    <div class="empty-icon" aria-hidden="true">↗</div>
    <h2>Select something to hand off</h2>
    <p>Select a board, component, or visual layer to generate reusable Flutter code, design compositions, and prototype metadata.</p>
  </section>

  <section id="result" class="workspace" hidden>
    <section class="handoff-overview" aria-label="Current handoff">
      <div>
        <p class="section-kicker">CURRENT HANDOFF</p>
        <strong id="selection-summary">0 selected layers</strong>
      </div>
      <div class="toolbar-actions">
        <button id="copy" class="button secondary" type="button" disabled>Copy code</button>
        <button id="download" class="button secondary" type="button" disabled>Download file</button>
        <button id="download-handoff" class="button primary" type="button" disabled>Download handoff</button>
      </div>
    </section>

    <section id="generated-files" class="file-browser" aria-label="Generated handoff files">
      <div class="section-heading">
        <div>
          <p class="section-kicker">OUTPUT</p>
          <h2>Generated files</h2>
        </div>
        <span id="generated-file-count" class="count-badge">0</span>
      </div>
      <div class="tier-filters" role="tablist" aria-label="Filter generated files">
        <button class="tier-filter selected" type="button" data-filter="all" role="tab" aria-selected="true">All</button>
        <button class="tier-filter" type="button" data-filter="design-system" role="tab" aria-selected="false">Design system</button>
        <button class="tier-filter" type="button" data-filter="design-composition" role="tab" aria-selected="false">Compositions</button>
        <button class="tier-filter" type="button" data-filter="prototype-metadata" role="tab" aria-selected="false">Prototype</button>
      </div>
      <div id="generated-file-list" class="generated-file-list"></div>
    </section>

    <section class="code-workspace" aria-label="Generated source preview">
      <div class="code-header">
        <div class="selected-file-details">
          <span id="selected-file-tier" class="artifact-badge">Generated file</span>
          <strong id="selected-file-name">generated_widget.dart</strong>
        </div>
        <span class="code-language">Dart</span>
      </div>
      <pre id="dart-preview" class="code-preview" aria-label="Generated Dart"><code></code></pre>
      <textarea id="dart" class="copy-source" readonly hidden spellcheck="false" aria-label="Generated Dart"></textarea>
    </section>

    <section id="quality-summary" class="quality-card" hidden aria-live="polite">
      <div class="section-heading">
        <div>
          <p class="section-kicker">HANDOFF QUALITY</p>
          <h2>Review before integration</h2>
        </div>
      </div>
      <div id="quality-metrics" class="quality-metrics"></div>
      <p id="quality-summary-text" class="muted"></p>
    </section>

    <details id="design-system" class="disclosure" open>
      <summary>
        <span>
          <span class="section-kicker">DESIGN SYSTEM</span>
          <strong>Tokens and bindings</strong>
        </span>
        <span id="index-status" class="summary-status">Waiting to index…</span>
      </summary>
      <div class="disclosure-content">
        <div class="design-system-toolbar">
          <p id="token-catalog-status" class="muted"></p>
          <button id="refresh-design-system" class="button text-button" type="button">Refresh catalog</button>
        </div>
        <dl class="stat-grid">
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
      </div>
    </details>

    <details id="assets" class="disclosure" hidden>
      <summary>
        <span>
          <span class="section-kicker">ASSETS & INTEGRATION</span>
          <strong>Asset files and pubspec snippet</strong>
        </span>
      </summary>
      <div class="disclosure-content">
        <p class="muted">Copy the generated snippet into the target Flutter project, then download individual assets if needed.</p>
        <textarea id="pubspec-assets" readonly spellcheck="false" aria-label="Generated pubspec assets"></textarea>
        <div id="asset-download-list" class="asset-download-list" aria-label="Exported assets"></div>
      </div>
    </details>

    <details id="diagnostics" class="disclosure diagnostics" hidden aria-live="polite">
      <summary>
        <span>
          <span class="section-kicker">REVIEW</span>
          <strong>Diagnostics and recommendations</strong>
        </span>
        <span id="diagnostic-count" class="count-badge">0</span>
      </summary>
      <div class="disclosure-content">
        <p class="muted">Recommendations never change the generated output. Use them to improve source structure when useful.</p>
        <ul id="diagnostic-list"></ul>
      </div>
    </details>
  </section>
`;

const emptyState = requiredElement<HTMLElement>("empty-state");
app.insertBefore(requiredElement<HTMLDetailsElement>("design-system"), emptyState);
const result = requiredElement<HTMLElement>("result");
const status = requiredElement<HTMLElement>("status");
const statusIndicator = requiredElement<HTMLElement>("status-indicator");
const summary = requiredElement<HTMLElement>("selection-summary");
const selectionProgress = requiredElement<HTMLElement>("selection-progress");
const dart = requiredElement<HTMLTextAreaElement>("dart");
const dartPreview = requiredElement<HTMLElement>("dart-preview");
const copy = requiredElement<HTMLButtonElement>("copy");
const download = requiredElement<HTMLButtonElement>("download");
const downloadHandoff = requiredElement<HTMLButtonElement>("download-handoff");
const assets = requiredElement<HTMLDetailsElement>("assets");
const pubspecAssets = requiredElement<HTMLTextAreaElement>("pubspec-assets");
const assetDownloadList = requiredElement<HTMLElement>("asset-download-list");
const generatedFiles = requiredElement<HTMLElement>("generated-files");
const generatedFileList = requiredElement<HTMLElement>("generated-file-list");
const generatedFileCount = requiredElement<HTMLElement>("generated-file-count");
const selectedFileName = requiredElement<HTMLElement>("selected-file-name");
const selectedFileTier = requiredElement<HTMLElement>("selected-file-tier");
const qualitySummary = requiredElement<HTMLElement>("quality-summary");
const qualitySummaryText = requiredElement<HTMLElement>("quality-summary-text");
const qualityMetrics = requiredElement<HTMLElement>("quality-metrics");
const diagnostics = requiredElement<HTMLDetailsElement>("diagnostics");
const diagnosticCount = requiredElement<HTMLElement>("diagnostic-count");
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
const tierFilters = [...app.querySelectorAll<HTMLButtonElement>(".tier-filter")];

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(latestDart);
    copy.textContent = "Copied";
  } catch {
    dart.focus();
    dart.select();
    copy.textContent = "Select code";
  }
});

refreshDesignSystem.addEventListener("click", () => {
  refreshDesignSystem.disabled = true;
  parent.postMessage({ source: "penpot-to-flutter", type: "refresh-design-system" }, "*");
});

download.addEventListener("click", () => downloadBlob(latestDart, "text/x-dart", selectedFileName.textContent ?? "generated_widget.dart"));

downloadHandoff.addEventListener("click", () => {
  if (latestHandoff === undefined) return;
  downloadBlob(`${JSON.stringify(latestHandoff, null, 2)}\n`, "application/json", "penpot_handoff.json");
});

for (const filter of tierFilters) {
  filter.addEventListener("click", () => {
    activeFilter = filter.dataset.filter as FileFilter;
    for (const candidate of tierFilters) {
      const selected = candidate === filter;
      candidate.classList.toggle("selected", selected);
      candidate.setAttribute("aria-selected", String(selected));
    }
    renderFileList();
  });
}

window.addEventListener("message", (event) => {
  if (isPluginToUiMessage(event.data)) render(event.data);
});

parent.postMessage({ source: "penpot-to-flutter", type: "request-conversion" }, "*");

function render(message: PluginToUiMessage): void {
  const renderStart = now();
  if (message.type === "design-system-index") renderIndexState(message);
  else renderConversion(message);
  measureUiRender(renderStart);
}

function renderConversion(message: ConversionMessage): void {
  if (message.designSystemFiles !== undefined) cachedDesignSystemFiles = message.designSystemFiles;
  updateCatalogStats(message);
  const hasSelection = message.result !== undefined && message.dart !== undefined;

  if (message.pending) {
    latestHandoff = undefined;
    downloadHandoff.disabled = true;
    emptyState.hidden = message.selectionCount > 0;
    result.hidden = true;
    selectionProgress.textContent = selectionCountLabel(message.selectionCount);
    setStatus(message.selectionCount === 0 ? "No layers selected" : "Resolving design-system dependencies…", message.selectionCount === 0 ? "idle" : "loading");
    return;
  }

  emptyState.hidden = hasSelection;
  result.hidden = !hasSelection;
  if (!hasSelection) {
    latestHandoff = undefined;
    downloadHandoff.disabled = true;
    setStatus("No layers selected", "idle");
    return;
  }

  selectionProgress.textContent = selectionCountLabel(message.selectionCount);
  summary.textContent = selectionCountLabel(message.selectionCount);
  latestHandoff = message.handoff;
  renderGeneratedFiles(message.files, message.dart);

  assets.hidden = (message.pubspecAssets === undefined || message.pubspecAssets === "") && (message.exportedAssets?.length ?? 0) === 0;
  pubspecAssets.hidden = message.pubspecAssets === undefined || message.pubspecAssets === "";
  pubspecAssets.value = message.pubspecAssets ?? "";
  renderExportedAssets(message.exportedAssets ?? []);

  const conversionDiagnostics = message.result.diagnostics;
  renderQuality(message.result.qualitySummary);
  const hasGenerationErrors = conversionDiagnostics.some((diagnostic) => diagnostic.severity === "error");
  setStatus(
    hasGenerationErrors ? "Generated with errors — review before export" : "Handoff ready for developer review",
    hasGenerationErrors ? "error" : "ready",
  );
  copy.disabled = hasGenerationErrors;
  copy.textContent = hasGenerationErrors ? "Copy unavailable" : "Copy code";
  download.disabled = hasGenerationErrors;
  downloadHandoff.disabled = hasGenerationErrors || latestHandoff === undefined;
  renderDiagnostics(conversionDiagnostics);
}

function updateCatalogStats(message: ConversionMessage): void {
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
}

function renderQuality(quality: IrQualitySummary | undefined): void {
  qualitySummary.hidden = quality === undefined;
  if (quality === undefined) return;
  const metrics = [
    ["Errors", quality.errors, "error"],
    ["Warnings", quality.warnings, "warning"],
    ["Info", quality.information, "info"],
    ["Recommendations", quality.recommendations, "recommendation"],
  ] as const;
  qualityMetrics.replaceChildren(...metrics.map(([label, count, kind]) => {
    const metric = document.createElement("div");
    metric.className = `quality-metric quality-${kind}`;
    metric.innerHTML = `<strong>${count}</strong><span>${label}</span>`;
    return metric;
  }));
  qualitySummaryText.textContent = quality.errors > 0
    ? "Resolve compiler errors before exporting the handoff."
    : quality.recommendations > 0
      ? "The handoff is generated faithfully; recommendations identify optional source-design improvements."
      : "No design-quality recommendations were reported for this selection.";
}

function renderDiagnostics(conversionDiagnostics: readonly Diagnostic[]): void {
  diagnostics.hidden = conversionDiagnostics.length === 0;
  diagnostics.open = conversionDiagnostics.some((diagnostic) => diagnostic.severity === "error" || diagnostic.severity === "warning");
  diagnosticCount.textContent = String(conversionDiagnostics.length);
  const grouped = new Map<string, Map<string, { readonly code: string; readonly message: string; count: number }>>();
  for (const diagnostic of conversionDiagnostics) {
    const byCode = grouped.get(diagnostic.severity) ?? new Map<string, { readonly code: string; readonly message: string; count: number }>();
    grouped.set(diagnostic.severity, byCode);
    const key = `${diagnostic.code}:${diagnostic.message}`;
    const current = byCode.get(key);
    if (current === undefined) byCode.set(key, { code: diagnostic.code, message: diagnostic.message, count: 1 });
    else current.count++;
  }
  const severityOrder = ["error", "warning", "info", "design-recommendation"];
  diagnosticList.replaceChildren(
    ...severityOrder.flatMap((severity) => {
      const entries = grouped.get(severity);
      if (entries === undefined) return [];
      const section = document.createElement("li");
      section.className = `diagnostic-section diagnostic-${severity}`;
      const heading = document.createElement("strong");
      heading.textContent = `${severityLabel(severity)} · ${entries.size}`;
      const details = document.createElement("ul");
      details.className = "diagnostic-details";
      details.replaceChildren(...[...entries.values()].map(({ code, message, count }) => {
        const item = document.createElement("li");
        item.textContent = `[${code}] ${count === 1 ? message : `${message} (${count} occurrences)`}`;
        return item;
      }));
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
  const percent = index.progress === undefined || index.progress.total === 0 ? "" : ` ${Math.round(index.progress.processed / index.progress.total * 100)}%`;
  indexStatus.textContent = index.status === "indexing"
    ? `Indexing${percent}`
    : index.status === "loading-metadata"
      ? "Reading catalog"
      : index.status === "ready"
        ? "Catalog ready"
        : index.status === "error"
          ? "Catalog unavailable"
          : "Catalog stale";
  tokenCatalogStatus.textContent = [...index.diagnostics.map((diagnostic) => `${diagnostic.severity.toUpperCase()}: ${diagnostic.message}`), ...(index.error === undefined ? [] : [index.error])].join(" ");
  refreshDesignSystem.disabled = index.status === "indexing" || index.status === "loading-metadata";
}

function renderExportedAssets(exported: ConversionMessage["exportedAssets"]): void {
  assetDownloadList.replaceChildren(...(exported ?? []).map((asset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "asset-download";
    button.textContent = asset.filename;
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
  }));
}

function renderGeneratedFiles(files: readonly GeneratedFile[] | undefined, fallback: string): void {
  const selectionFiles = files?.length === 0 || files === undefined ? [{ path: "generated_widget.dart", source: fallback }] : files;
  visibleFiles = [...selectionFiles, ...cachedDesignSystemFiles.filter((stable) => !selectionFiles.some((file) => file.path === stable.path))];
  fallbackDart = fallback;
  generatedFiles.hidden = visibleFiles.length < 2;
  generatedFileCount.textContent = String(visibleFiles.length);
  renderFileList();
}

function renderFileList(): void {
  const filtered = activeFilter === "all" ? visibleFiles : visibleFiles.filter((file) => file.tier === activeFilter);
  if (!filtered.some((file) => file.path === selectedFilePath)) selectedFilePath = filtered[0]?.path ?? visibleFiles[0]?.path ?? "";
  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "file-filter-empty";
    empty.textContent = "No files in this output tier for the current selection.";
    generatedFileList.replaceChildren(empty);
    return;
  }
  generatedFileList.replaceChildren(...filtered.map((file) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "generated-file";
    button.dataset.path = file.path;
    const badge = document.createElement("span");
    badge.className = `artifact-badge artifact-${file.tier ?? "generated"}`;
    badge.textContent = artifactAuthority(file.tier);
    const path = document.createElement("span");
    path.textContent = file.path;
    button.append(badge, path);
    const selected = file.path === selectedFilePath;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-current", selected ? "true" : "false");
    button.addEventListener("click", () => {
      selectedFilePath = file.path;
      renderFileList();
    });
    return button;
  }));
  const selected = visibleFiles.find((file) => file.path === selectedFilePath) ?? { path: "generated_widget.dart", source: fallbackDart };
  renderDart(selected.source, selected.path, selected.tier);
}

function renderDart(source: string, path: string, tier?: GeneratedArtifactTier): void {
  latestDart = source;
  dart.value = source;
  selectedFileName.textContent = path.split("/").pop() ?? path;
  selectedFileTier.textContent = artifactAuthority(tier);
  selectedFileTier.className = `artifact-badge artifact-${tier ?? "generated"}`;
  dartPreview.querySelector("code")!.innerHTML = highlightDart(source);
}

function setStatus(message: string, state: "idle" | "loading" | "ready" | "error"): void {
  status.textContent = message;
  statusIndicator.textContent = state === "ready" ? "Ready" : state === "error" ? "Review needed" : state === "loading" ? "Working" : "Waiting";
  statusIndicator.dataset.state = state;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function assetMimeType(type: "svg" | "png" | "jpg" | "webp"): string {
  return type === "svg" ? "image/svg+xml" : type === "jpg" ? "image/jpeg" : `image/${type}`;
}

function artifactAuthority(tier: GeneratedFile["tier"]): string {
  switch (tier) {
    case "design-system": return "Reusable code";
    case "design-composition": return "Composition";
    case "prototype-metadata": return "Prototype hint";
    case "manifest": return "Manifest";
    default: return "Generated file";
  }
}

function severityLabel(severity: string): string {
  return severity === "design-recommendation" ? "Recommendation" : `${severity[0]!.toUpperCase()}${severity.slice(1)}`;
}

function downloadBlob(content: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function highlightDart(source: string): string {
  return hljs.highlight(source, { language: "dart", ignoreIllegals: true }).value;
}

function selectionCountLabel(count: number): string {
  return `${count} selected ${count === 1 ? "layer" : "layers"}`;
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
  if (element === null) throw new Error(`Missing #${id}`);
  return element as T;
}
