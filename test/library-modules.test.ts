import assert from "node:assert/strict";
import test from "node:test";

import { extractSelection, type PenpotSourceShape } from "../src/core/extractor.js";
import { generateFlutterFiles } from "../src/core/flutter-generator.js";

const buttonRoot = {
  id: "button-root",
  name: "Button",
  type: "board",
  x: 0,
  y: 0,
  width: 120,
  height: 40,
  visible: true,
  children: [{
    id: "button-label",
    name: "Label",
    type: "text",
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    visible: true,
    characters: "Continue",
    fontSize: "16",
  }],
} as const;

function sharedInstance(id: string, libraryId = "company-library"): PenpotSourceShape {
  return {
    id,
    name: "Button",
    type: "board",
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    visible: true,
    isComponentInstance: true,
    componentId: "button",
    componentLibraryId: libraryId,
    children: buttonRoot.children,
  };
}

test("generates a shared library module once and imports it deterministically", () => {
  const result = extractSelection(
    [
      { id: "screen-one", name: "Screen One", type: "board", x: 0, y: 0, width: 160, height: 80, visible: true, children: [sharedInstance("one")] },
      { id: "screen-two", name: "Screen Two", type: "board", x: 0, y: 0, width: 160, height: 80, visible: true, children: [sharedInstance("two")] },
    ],
    [{ id: "button", libraryId: "company-library", libraryScope: "shared", name: "Button", root: buttonRoot }],
    [],
    {
      libraries: [{ id: "company-library", name: "Company Design System", scope: "shared" }],
      tokens: [{ id: "brand", name: "color.brand", type: "color", value: "#123456", setId: "global", sourceLibraryId: "company-library", sourceLibraryScope: "shared" }],
      sets: [{ id: "global", name: "Global", active: true, tokenIds: ["brand"], sourceLibraryId: "company-library", sourceLibraryScope: "shared" }],
    },
  );

  assert.deepEqual(result.libraries, [{
    id: "company-library",
    name: "Company Design System",
    scope: "shared",
    components: ["company-library:button"],
    tokenSets: ["global"],
    assets: [],
    dependencies: [],
  }]);

  const files = generateFlutterFiles(result.root, result.components, result.tokens, result.tokenSets, result.tokenThemes, result.responsiveScreen, result.typographyStyles, undefined, result.assetRegistry, result.libraries);
  const paths = files.map((file) => file.path);
  assert.ok(paths.includes("libraries/company_design_system/components/button.dart"));
  assert.ok(paths.includes("libraries/company_design_system/company_design_system.dart"));
  assert.ok(paths.includes("libraries/company_design_system/theme/penpot_tokens.dart"));
  assert.match(files.find((file) => file.path === "screens/screen_one.dart")!.source, /import '\.\.\/libraries\/company_design_system\/components\/button\.dart';/);
  assert.match(files.find((file) => file.path === "libraries/company_design_system/company_design_system.dart")!.source, /export 'components\/button\.dart';/);
  assert.deepEqual(
    generateFlutterFiles(result.root, result.components, result.tokens, result.tokenSets, result.tokenThemes, result.responsiveScreen, result.typographyStyles, undefined, result.assetRegistry, result.libraries),
    files,
  );
});

test("preserves missing-library semantics and reports library graph diagnostics", () => {
  const unresolved = extractSelection([sharedInstance("unresolved", "missing-library")]);
  assert.ok(unresolved.diagnostics.some((diagnostic) => diagnostic.code === "LIBRARY_UNAVAILABLE"));

  const componentA = {
    ...buttonRoot,
    id: "a-root",
    name: "A",
    children: [sharedInstance("a-to-b", "library-b")],
  };
  const componentB = {
    ...buttonRoot,
    id: "b-root",
    name: "B",
    children: [sharedInstance("b-to-a", "library-a")],
  };
  const cyclic = extractSelection(
    [sharedInstance("screen-a", "library-a")],
    [
      { id: "button", libraryId: "library-a", libraryScope: "shared", name: "A", root: componentA },
      { id: "button", libraryId: "library-b", libraryScope: "shared", name: "B", root: componentB },
    ],
    [],
    { libraries: [
      { id: "library-a", name: "Design System", scope: "shared" },
      { id: "library-b", name: "Design-System", scope: "shared" },
    ] },
  );
  const codes = new Set(cyclic.diagnostics.map((diagnostic) => diagnostic.code));
  assert.ok(codes.has("LIBRARY_DEPENDENCY_CYCLE"));
  assert.ok(codes.has("LIBRARY_NAME_COLLISION"));
  assert.equal(cyclic.libraries.length, 2);
});

test("keeps library assets and unresolved shared tokens attributable to their library", () => {
  const result = extractSelection(
    [{
      id: "shared-image-root",
      name: "Shared image",
      type: "board",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      visible: true,
      sourceLibraryId: "assets-library",
      sourceLibraryScope: "shared",
      tokenBindings: { fill: "color.missing" },
      children: [{
        id: "shared-image",
        name: "Avatar",
        type: "image",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        visible: true,
        sourceLibraryId: "assets-library",
        sourceLibraryScope: "shared",
        fills: [{ fillImage: { id: "avatar", name: "Avatar", width: 100, height: 100, mtype: "image/png" } }],
      }],
    }],
    [],
    [],
    { libraries: [{ id: "assets-library", name: "Assets", scope: "shared" }] },
  );

  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "LIBRARY_TOKEN_UNRESOLVED"));
  assert.deepEqual(result.libraries[0]?.assets, ["avatar"]);
});
