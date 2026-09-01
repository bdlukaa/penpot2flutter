import { isPluginToUiMessage, type PluginToUiMessage } from "./shared/messages.js";
import type { GeneratedFile } from "./shared/ir.js";
import { APP_VERSION } from "./shared/version.js";
import "./style.css";

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
  </header>
  <section id="design-system" aria-label="Design system statistics">
    <h2>Design System</h2>
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
      <h2>Add exported assets to pubspec.yaml</h2>
      <textarea id="pubspec-assets" readonly spellcheck="false" aria-label="Generated pubspec assets"></textarea>
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
const dart = requiredElement<HTMLTextAreaElement>("dart");
const dartPreview = requiredElement<HTMLElement>("dart-preview");
const copy = requiredElement<HTMLButtonElement>("copy");
const download = requiredElement<HTMLButtonElement>("download");
const assets = requiredElement<HTMLElement>("assets");
const pubspecAssets = requiredElement<HTMLTextAreaElement>("pubspec-assets");
const generatedFiles = requiredElement<HTMLElement>("generated-files");
const generatedFileList = requiredElement<HTMLElement>("generated-file-list");
const diagnostics = requiredElement<HTMLElement>("diagnostics");
const diagnosticList = requiredElement<HTMLUListElement>("diagnostic-list");
const tokenSetCount = requiredElement<HTMLElement>("token-set-count");
const tokenCount = requiredElement<HTMLElement>("token-count");
const tokenThemeCount = requiredElement<HTMLElement>("token-theme-count");
const tokenGroupCount = requiredElement<HTMLElement>("token-group-count");
const tokenCatalogStatus = requiredElement<HTMLElement>("token-catalog-status");
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
  emptyState.hidden = hasSelection;
  result.hidden = !hasSelection;

  if (!hasSelection) {
    status.textContent = "No layers selected";
    return;
  }

  status.textContent = "Generated from the current selection";
  summary.textContent = `${message.selectionCount} selected ${message.selectionCount === 1 ? "layer" : "layers"}`;
  renderGeneratedFiles(message.files, message.dart);
  assets.hidden = message.pubspecAssets === undefined || message.pubspecAssets === "";
  pubspecAssets.value = message.pubspecAssets ?? "";
  copy.disabled = false;
  copy.textContent = "Copy Dart";
  download.disabled = false;

  const warnings = message.result.diagnostics;
  diagnostics.hidden = warnings.length === 0;
  const diagnosticCounts = new Map<string, { readonly severity: string; readonly message: string; count: number }>();
  for (const diagnostic of warnings) {
    const key = `${diagnostic.severity}:${diagnostic.message}`;
    const current = diagnosticCounts.get(key);
    if (current === undefined) diagnosticCounts.set(key, { severity: diagnostic.severity, message: diagnostic.message, count: 1 });
    else current.count++;
  }
  diagnosticList.replaceChildren(
    ...[...diagnosticCounts.values()].map(({ severity, message, count }) => {
      const item = document.createElement("li");
      item.textContent = `${severity.toUpperCase()}: ${count === 1 ? message : `${message} (${count} occurrences)`}`;
      return item;
    }),
  );
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

function selectedFileName(): string {
  const selected = generatedFileList.querySelector<HTMLButtonElement>(".selected")?.textContent;
  return selected?.split("/").pop() || "generated_widget.dart";
}

function highlightDart(source: string): string {
  const tokenPattern = /('(?:\\\\.|[^'\\\\])*'|"(?:\\\\.|[^"\\\\])*"|\\b\\d+(?:\\.\\d+)?\\b|\\b(?:class|extends|const|override|return|import|final|void|Widget|StatelessWidget)\\b|.)/gs;
  return [...source.matchAll(tokenPattern)]
    .map(([token]) => {
      const escaped = escapeHtml(token);
      if (/^['"]/.test(token)) return `<span class="token-string">${escaped}</span>`;
      if (/^\\d/.test(token)) return `<span class="token-number">${escaped}</span>`;
      if (/^(class|extends|const|override|return|import|final|void|Widget|StatelessWidget)$/.test(token)) {
        return `<span class="token-keyword">${escaped}</span>`;
      }
      return escaped;
    })
    .join("");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}
