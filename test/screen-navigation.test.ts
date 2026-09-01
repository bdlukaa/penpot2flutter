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

test("builds deterministic screen routes and Navigator files for a three-screen flow", () => {
  const result = navigationResult(
    [board("login", "Login"), board("home", "Home"), board("checkout", "Checkout")],
    {
      flows: [{ id: "flow-1", name: "Main", startingBoardId: "login" }],
      interactions: [
        { id: "login:0", ownerShapeId: "login", trigger: "click", action: { type: "navigate", destinationBoardId: "home" } },
        { id: "home:0", ownerShapeId: "home", trigger: "click", action: { type: "navigate", destinationBoardId: "checkout" } },
        { id: "checkout:0", ownerShapeId: "checkout", trigger: "click", action: { type: "back" } },
      ],
    },
  );
  const graph = result.navigationGraph!;
  assert.deepEqual(graph.screens.map((screen) => [screen.id, screen.routeName]), [["checkout", "/checkout"], ["home", "/home"], ["login", "/login"]]);
  assert.equal(graph.flowEntries[0].screenId, "login");
  assert.deepEqual(graph.edges.map((edge) => edge.kind), ["back", "navigate", "navigate"]);

  const files = generateFlutterFiles(result.root, result.components, result.tokens, result.tokenSets, result.tokenThemes, result.responsiveScreen, result.typographyStyles, undefined, result.assetRegistry, result.libraries, graph);
  assert.match(files.find((file) => file.path === "screens/checkout_screen.dart")!.source, /class CheckoutScreen extends StatelessWidget/);
  const navigation = files.find((file) => file.path === "navigation.dart")!.source;
  assert.match(navigation, /static const initialRoute = '\/login';/);
  assert.match(navigation, /'\/checkout' => const CheckoutScreen\(\)/);
  assert.deepEqual(generateFlutterFiles(result.root, result.components, result.tokens, result.tokenSets, result.tokenThemes, result.responsiveScreen, result.typographyStyles, undefined, result.assetRegistry, result.libraries, graph), files);
});

test("emits Penpot triggers, actions, and animations around their source nodes", () => {
  const trigger = { id: "trigger", name: "Trigger", type: "rectangle", x: 20, y: 20, width: 100, height: 40, visible: true } as const;
  const result = navigationResult(
    [board("login", "Login", [trigger]), board("home", "Home"), board("dialog", "Dialog")],
    {
      flows: [{ id: "flow", name: "Main", startingBoardId: "login" }],
      interactions: [
        { id: "click", ownerShapeId: "trigger", trigger: "click", action: { type: "navigate", destinationBoardId: "home", animation: { type: "push", durationMs: 250, direction: "left" } } },
        { id: "click", ownerShapeId: "trigger", trigger: "click", action: { type: "navigate", destinationBoardId: "home", animation: { type: "push", durationMs: 250, direction: "left" } } },
        { id: "click", ownerShapeId: "trigger", trigger: "click", action: { type: "navigate", destinationBoardId: "home", animation: { type: "push", durationMs: 250, direction: "left" } } },
        { id: "enter", ownerShapeId: "trigger", trigger: "mouse-enter", action: { type: "open-overlay", destinationBoardId: "dialog", animation: { type: "dissolve", durationMs: 120 }, overlay: { position: "manual", relativeToSourceId: "trigger", manualPosition: { x: 13, y: 14 }, closeWhenClickOutside: true, addBackgroundOverlay: true } } },
        { id: "leave", ownerShapeId: "trigger", trigger: "mouse-leave", action: { type: "close-overlay", destinationBoardId: "dialog" } },
        { id: "delay", ownerShapeId: "trigger", trigger: "after-delay", delayMs: 300, action: { type: "back" } },
        { id: "url", ownerShapeId: "trigger", trigger: "click", action: { type: "open-url", url: "https://example.com" } },
      ],
    },
  );
  const files = generateFlutterFiles(result.root, result.components, result.tokens, result.tokenSets, result.tokenThemes, result.responsiveScreen, result.typographyStyles, undefined, result.assetRegistry, result.libraries, result.navigationGraph);
  const login = files.find((file) => file.path === "screens/login_screen.dart")!.source;
  assert.match(login, /GestureDetector\(/);
  assert.match(login, /MouseRegion\(/);
  assert.match(login, /PenpotDelayedInteraction\(/);
  assert.match(login, /Link\(/);
  assert.match(login, /PenpotPrototype\.navigate\(context, \(\) => const HomeScreen\(\), duration: Duration\(milliseconds: 250\)/);
  assert.equal((login.match(/PenpotPrototype\.navigate\(/g) ?? []).length, 1);
  assert.match(login, /PenpotPrototype\.openOverlay\(context, 'dialog'\)/);
  assert.match(login, /PenpotAnchor\(/);
  assert.match(login, /relativeTo: 'trigger'/);
  assert.match(login, /manualPosition: Offset\(13, 14\)/);
  assert.match(login, /Uri\.parse\('https:\/\/example\.com'\)/);
  assert.ok(files.some((file) => file.path === "overlays/dialog_overlay.dart"));
  assert.ok(files.some((file) => file.path === "prototype_interactions.dart"));
  assertDartParses(login);
  assertDartParses(files.find((file) => file.path === "prototype_interactions.dart")!.source);
});

test("does not classify catalog boards or overlay targets as standard screens", () => {
  const result = navigationResult(
    [board("catalog", "Component catalog"), board("login", "Login"), board("dialog", "Confirmation")],
    {
      flows: [{ id: "flow", name: "Main", startingBoardId: "login" }],
      interactions: [{ id: "login:0", ownerShapeId: "login", trigger: "click", action: { type: "open-overlay", destinationBoardId: "dialog" } }],
    },
  );
  assert.deepEqual(result.navigationGraph!.screens.map((screen) => screen.id), ["login"]);
  assert.deepEqual(result.navigationGraph!.overlays.map((overlay) => overlay.id), ["dialog"]);
});

test("keeps reusable components and responsive visual variants separate from navigation", () => {
  const component = board("button-root", "Button");
  const screens = [
    { ...board("product-mobile", "Product Mobile"), responsive: { groupId: "product", minWidth: 0 } },
    { ...board("product-desktop", "Product Desktop"), responsive: { groupId: "product", minWidth: 600 } },
  ];
  const result = extractSelection(
    screens,
    [{ id: "button", name: "Button", root: component }],
    [],
    {},
    {},
    { flows: [{ id: "flow", name: "Main", startingBoardId: "product-mobile" }], interactions: [] },
  );
  assert.equal(result.responsiveScreen?.name, "product");
  assert.equal(result.navigationGraph!.screens[0].id, "product-mobile");
  assert.equal(result.components.length, 1);
});

test("reports unresolved targets and stable route collisions", () => {
  const result = navigationResult(
    [board("one", "Product Details"), board("two", "Product Details")],
    {
      flows: [{ id: "one-flow", name: "One", startingBoardId: "one" }, { id: "two-flow", name: "Two", startingBoardId: "two" }, { id: "missing-flow", name: "Missing", startingBoardId: "missing" }],
      interactions: [{ id: "one:0", ownerShapeId: "one", trigger: "click", action: { type: "navigate", destinationBoardId: "missing" } }],
    },
  );
  assert.deepEqual(result.navigationGraph!.screens.map((screen) => screen.routeName), ["/product-details", "/product-details-two"]);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "ROUTE_NAME_COLLISION"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "NAVIGATION_TARGET_UNRESOLVED"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "FLOW_ENTRY_UNRESOLVED"));
});
