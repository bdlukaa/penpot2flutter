import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { extractSelection, type PenpotSourceShape } from "../src/core/extractor.js";
import { generateFlutterFiles } from "../src/core/flutter-generator.js";
import type { PenpotPrototypeSource } from "../src/core/screen-navigation-analyzer.js";

function board(id: string, name: string, children: readonly PenpotSourceShape[] = []): PenpotSourceShape {
  return { id, name, type: "board", x: 0, y: 0, width: 360, height: 640, visible: true, children };
}

function navigationResult(shapes: readonly PenpotSourceShape[], prototype: PenpotPrototypeSource) {
  return extractSelection(shapes, [], [], {}, {}, prototype);
}

function flutterFiles(result: ReturnType<typeof extractSelection>) {
  return generateFlutterFiles(result.root, result.components, result.tokens, result.tokenSets, result.tokenThemes, result.responsiveScreen, result.typographyStyles, undefined, result.assetRegistry, result.libraries, result.prototypeMetadata);
}

function assertDartParses(source: string): void {
  const directory = mkdtempSync(join(tmpdir(), "penpot-to-flutter-"));
  const path = join(directory, "generated.dart");
  try {
    writeFileSync(path, source);
    execFileSync("dart", ["format", "--output=none", path]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const trigger = { id: "trigger", name: "Trigger", type: "rectangle", x: 20, y: 20, width: 100, height: 40, visible: true } as const;

test("preserves complete prototype metadata on the conversion result", () => {
  const result = navigationResult(
    [board("home", "Home", [trigger]), board("dialog", "Dialog")],
    {
      destinations: [{ id: "details", name: "Product Details" }],
      flows: [{ id: "main-flow", name: "Main", startingBoardId: "home" }],
      interactions: [
        { id: "navigate", ownerShapeId: "trigger", trigger: "click", action: { type: "navigate", destinationBoardId: "details", preserveScrollPosition: true, animation: { type: "push", durationMs: 250, easing: "ease-in-out", direction: "left", way: "in" } } },
        { id: "overlay", ownerShapeId: "trigger", trigger: "mouse-enter", action: { type: "open-overlay", destinationBoardId: "dialog", overlay: { position: "manual", relativeToSourceId: "trigger", manualPosition: { x: 13, y: 14 }, closeWhenClickOutside: true, addBackgroundOverlay: true } } },
        { id: "url", ownerShapeId: "trigger", trigger: "mouse-leave", action: { type: "open-url", url: "https://example.com/path?q=1" } },
        { id: "delay", ownerShapeId: "trigger", trigger: "after-delay", delayMs: 300, action: { type: "back" } },
      ],
    },
  );

  assert.deepEqual(result.prototypeMetadata, {
    destinations: [
      { id: "details", name: "Product Details" },
      { id: "dialog", name: "Dialog" },
      { id: "home", name: "Home" },
    ],
    interactions: [
      { id: "delay", sourceNodeId: "trigger", trigger: "after-delay", kind: "back", delayMs: 300 },
      { id: "navigate", sourceNodeId: "trigger", trigger: "click", kind: "navigate", targetId: "details", preserveScrollPosition: true, animation: { type: "push", durationMs: 250, easing: "ease-in-out", direction: "left", way: "in" } },
      { id: "overlay", sourceNodeId: "trigger", trigger: "mouse-enter", kind: "open-overlay", targetId: "dialog", overlay: { position: "manual", relativeToSourceId: "trigger", manualPosition: { x: 13, y: 14 }, closeWhenClickOutside: true, addBackgroundOverlay: true } },
      { id: "url", sourceNodeId: "trigger", trigger: "mouse-leave", kind: "open-url", url: "https://example.com/path?q=1" },
    ],
    flows: [{ id: "main-flow", name: "Main", destinationId: "home" }],
    overlayDestinationIds: ["dialog"],
  });
});

test("generates deterministic rooted compositions and prototype integration metadata without routing", () => {
  const result = navigationResult(
    [board("home", "Home", [trigger]), board("dialog", "Dialog")],
    {
      destinations: [{ id: "details", name: "Product Details" }],
      flows: [{ id: "main-flow", name: "Main", startingBoardId: "home" }],
      interactions: [
        { id: "navigate", ownerShapeId: "trigger", trigger: "click", action: { type: "navigate", destinationBoardId: "details", preserveScrollPosition: true, animation: { type: "push", durationMs: 250, easing: "ease-in-out", direction: "left", way: "in" } } },
        { id: "overlay", ownerShapeId: "trigger", trigger: "mouse-enter", action: { type: "open-overlay", destinationBoardId: "dialog", overlay: { position: "manual", relativeToSourceId: "trigger", manualPosition: { x: 13, y: 14 }, closeWhenClickOutside: true, addBackgroundOverlay: true } } },
        { id: "url", ownerShapeId: "trigger", trigger: "mouse-leave", action: { type: "open-url", url: "https://example.com/path?q=1" } },
        { id: "delay", ownerShapeId: "trigger", trigger: "after-delay", delayMs: 300, action: { type: "back" } },
      ],
    },
  );
  const files = flutterFiles(result);
  const composition = files.find((file) => file.path === "lib/generated/penpot/compositions/selection_design.dart")!;
  const metadata = files.find((file) => file.path === "lib/generated/penpot/prototype_destinations.dart")!;
  const generatedDart = files.filter((file) => file.path.endsWith(".dart")).map((file) => file.source).join("\n");

  assert.ok(files.every((file) => file.path.startsWith("lib/generated/penpot/")));
  assert.ok(files.filter((file) => file.tier === "design-composition").every((file) => /\/compositions\/.*_design\.dart$/.test(file.path)));
  assert.ok(!files.some((file) => /\/(?:routes|navigation)\.dart$/.test(file.path)));
  assert.doesNotMatch(generatedDart, /\b(?:Navigator|MaterialPageRoute|Link|OverlayPortal)\b/);
  assert.match(metadata.source, /PenpotPrototypeFlow\(id: 'main-flow', name: 'Main', destination: PenpotDestination\.home\)/);
  assert.match(metadata.source, /trigger: PenpotPrototypeTrigger\.afterDelay,/);
  assert.match(metadata.source, /trigger: PenpotPrototypeTrigger\.click,/);
  assert.match(metadata.source, /trigger: PenpotPrototypeTrigger\.mouseEnter,/);
  assert.match(metadata.source, /trigger: PenpotPrototypeTrigger\.mouseLeave,/);
  assert.match(metadata.source, /animation: <String, Object\?>\{'type': 'push', 'durationMs': 250, 'easing': 'ease-in-out', 'direction': 'left', 'way': 'in'\}/);
  assert.match(metadata.source, /overlay: <String, Object\?>\{'position': 'manual', 'relativeToSourceId': 'trigger', 'manualPosition': <String, Object\?>\{'x': 13, 'y': 14\}, 'closeWhenClickOutside': true, 'addBackgroundOverlay': true\}/);
  assert.match(metadata.source, /url: 'https:\/\/example\.com\/path\?q=1',/);
  assert.deepEqual(flutterFiles(result), files);
  assertDartParses(composition.source);
  assertDartParses(metadata.source);
});

test("keeps reusable components stateless and exposes prototype interaction callbacks", () => {
  const componentTrigger = { ...trigger, id: "menu-trigger" };
  const result = extractSelection(
    [board("home", "Home"), board("trending", "Trending")],
    [{ id: "menu", name: "Menu", root: board("menu-root", "Menu", [componentTrigger]), interactions: [{ id: "menu:trending", ownerShapeId: "menu-trigger", trigger: "click", action: { type: "navigate", destinationBoardId: "trending" } }] }],
    [],
    {},
    {},
    { flows: [{ id: "main", name: "Main", startingBoardId: "home" }], interactions: [] },
  );
  const files = flutterFiles(result);
  const component = files.find((file) => file.path === "lib/generated/penpot/components/menu.dart")!.source;
  const metadata = files.find((file) => file.path === "lib/generated/penpot/prototype_destinations.dart")!.source;

  assert.match(component, /class Menu extends StatelessWidget/);
  assert.match(component, /final ValueChanged<PenpotPrototypeInteraction>\? onPrototypeInteraction;/);
  assert.match(component, /onPrototypeInteraction!\(penpotPrototypeInteractions\['menu:trending'\]!\)/);
  assert.doesNotMatch(component, /\b(?:StatefulWidget|Navigator|MaterialPageRoute|Link|OverlayPortal)\b/);
  assert.match(metadata, /'menu:trending': PenpotPrototypeInteraction\(/);
  assertDartParses(component);
  assertDartParses(metadata);
});

test("reports unresolved prototype destinations and flow entries without route collisions", () => {
  const result = navigationResult(
    [board("one", "Product Details"), board("two", "Product Details")],
    {
      flows: [{ id: "missing-flow", name: "Missing", startingBoardId: "missing-flow-entry" }],
      interactions: [{ id: "missing-target", ownerShapeId: "one", trigger: "click", action: { type: "navigate", destinationBoardId: "missing-target" } }],
    },
  );
  const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

  assert.ok(codes.includes("PROTOTYPE_DESTINATION_UNRESOLVED"));
  assert.ok(codes.includes("FLOW_ENTRY_UNRESOLVED"));
  assert.ok(!codes.includes("ROUTE_NAME_COLLISION"));
  assert.deepEqual(result.prototypeMetadata?.destinations.map((destination) => destination.id), ["missing-flow-entry", "missing-target", "one", "two"]);
  assert.ok(!flutterFiles(result).some((file) => /\/(?:routes|navigation)\.dart$/.test(file.path)));
});
