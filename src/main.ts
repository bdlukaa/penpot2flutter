import { isPluginToUiMessage, type PluginToUiMessage } from "./shared/messages.js";
import { APP_VERSION } from "./shared/version.js";
import "./style.css";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) {
  throw new Error("Missing plugin app root.");
}

let latestDart = "";

app.innerHTML = `
  <header>
    <p class="eyebrow">PENPOT TO FLUTTER <span class="version">v${APP_VERSION}</span></p>
    <h1>Selection export</h1>
    <p id="status" class="muted">Reading the current selection…</p>
  </header>
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
    <pre id="dart-preview" class="code-preview" aria-label="Generated Dart"><code></code></pre>
    <textarea id="dart" class="copy-source" readonly hidden spellcheck="false" aria-label="Generated Dart"></textarea>
    <section id="assets" hidden>
      <h2>Add exported assets to pubspec.yaml</h2>
      <textarea id="pubspec-assets" readonly spellcheck="false" aria-label="Generated pubspec assets"></textarea>
    </section>
    <section id="diagnostics" hidden aria-live="polite">
      <h2>Conversion warnings</h2>
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
const diagnostics = requiredElement<HTMLElement>("diagnostics");
const diagnosticList = requiredElement<HTMLUListElement>("diagnostic-list");

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
  link.download = "generated_widget.dart";
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
  const hasSelection = message.result !== undefined && message.dart !== undefined;
  emptyState.hidden = hasSelection;
  result.hidden = !hasSelection;

  if (!hasSelection) {
    status.textContent = "No layers selected";
    return;
  }

  latestDart = message.dart;
  status.textContent = "Generated from the current selection";
  summary.textContent = `${message.selectionCount} selected ${message.selectionCount === 1 ? "layer" : "layers"}`;
  dart.value = message.dart;
  dartPreview.querySelector("code")!.innerHTML = highlightDart(message.dart);
  assets.hidden = message.pubspecAssets === undefined || message.pubspecAssets === "";
  pubspecAssets.value = message.pubspecAssets ?? "";
  copy.disabled = false;
  copy.textContent = "Copy Dart";
  download.disabled = false;

  const warnings = message.result.diagnostics;
  diagnostics.hidden = warnings.length === 0;
  diagnosticList.replaceChildren(
    ...warnings.map((warning) => {
      const item = document.createElement("li");
      item.textContent = warning.message;
      return item;
    }),
  );
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
