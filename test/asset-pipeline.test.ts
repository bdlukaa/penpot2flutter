import assert from "node:assert/strict";
import test from "node:test";

import { createAssetRegistry } from "../src/core/asset-pipeline.js";
import { extractSelection } from "../src/core/extractor.js";
import { generateFlutterAssets, generateFlutterFiles, generateFlutterWidget, generatePubspecSnippet, validateGeneratedDartFiles } from "../src/core/flutter-generator.js";

const dimensions = { width: 32, height: 32 } as const;

test("allocates semantic asset paths and stable collision suffixes", () => {
  const first = createAssetRegistry([
    { id: "b", sourceNodeId: "node-b", type: "svg", semanticName: "Icon / Cart", contentHash: "bbb", dimensions },
    { id: "a", sourceNodeId: "node-a", type: "svg", semanticName: "Icon / Cart", contentHash: "aaa", dimensions },
  ]);
  const reversed = createAssetRegistry([
    { id: "a", sourceNodeId: "node-a", type: "svg", semanticName: "Icon / Cart", contentHash: "aaa", dimensions },
    { id: "b", sourceNodeId: "node-b", type: "svg", semanticName: "Icon / Cart", contentHash: "bbb", dimensions },
  ]);

  assert.deepEqual(first.assets, reversed.assets);
  assert.deepEqual(first.assets.map((asset) => asset.filename), ["assets/icons/cart.svg", "assets/icons/cart-2.svg"]);
  assert.deepEqual(first.diagnostics.map((diagnostic) => diagnostic.code), ["ASSET_NAME_COLLISION"]);
});

test("deduplicates identical content while retaining source aliases", () => {
  const registry = createAssetRegistry([
    { id: "media-one", sourceNodeId: "node-one", type: "png", semanticName: "Hero Image", contentHash: "same" },
    { id: "media-two", sourceNodeId: "node-two", type: "png", semanticName: "Another Image", contentHash: "same" },
  ]);

  assert.equal(registry.assets.length, 1);
  assert.equal(registry.assetIds["media-two"], "media-one");
  assert.deepEqual(registry.diagnostics.map((diagnostic) => diagnostic.code), ["ASSET_DUPLICATE_DETECTED"]);
});

test("extracts semantic image and icon assets and generates AppAssets references", () => {
  const result = extractSelection([{
    id: "asset-board",
    name: "Asset board",
    type: "board",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    visible: true,
    children: [
      {
        id: "hero-node",
        name: "Hero Image",
        type: "image",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        visible: true,
        fills: [{ fillImage: { id: "media-hero", width: 800, height: 400, mtype: "image/webp" } }],
      },
      { id: "cart-node", name: "Icon / Cart", type: "path", x: 100, y: 0, width: 32, height: 32, visible: true },
    ],
  }]);
  const files = generateFlutterFiles(result.root, [], [], [], [], undefined, [], undefined, result.assetRegistry);
  const screen = files.find((file) => file.path.startsWith("screens/"))!.source;
  const assets = files.find((file) => file.path === "assets.dart")!.source;

  assert.deepEqual(result.assetRegistry.map((asset) => asset.filename), ["assets/icons/cart.svg", "assets/images/hero.webp"]);
  assert.match(assets, /static const cart = 'assets\/icons\/cart\.svg';/);
  assert.match(assets, /static const hero = 'assets\/images\/hero\.webp';/);
  assert.match(screen, /import '\.\.\/assets\.dart';/);
  assert.match(screen, /AppAssets\.cart/);
  assert.match(screen, /AppAssets\.hero/);
  assert.match(generatePubspecSnippet(result.assetRegistry), /- assets\/icons\/cart\.svg/);
  assert.match(generatePubspecSnippet(result.assetRegistry), /- assets\/images\/hero\.webp/);
});

test("preserves image fit, alignment, and clipping metadata", () => {
  const result = extractSelection([{
    id: "photo",
    name: "Photo",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    visible: true,
    imageFit: "contain",
    imageAlignment: "bottomRight",
    borderRadius: 12,
    fills: [{ fillImage: { id: "photo-id", width: 200, height: 160, mtype: "image/png" } }],
  }]);
  const dart = generateFlutterWidget(result.root);

  assert.match(dart, /fit: BoxFit\.contain/);
  assert.match(dart, /alignment: Alignment\.bottomRight/);
  assert.match(dart, /borderRadius: BorderRadius\.circular\(12\)/);
});

test("selects a raster asset for an unsupported vector effect when supplied", () => {
  const result = extractSelection([{
    id: "illustration",
    name: "Complex illustration",
    type: "path",
    x: 0,
    y: 0,
    width: 80,
    height: 80,
    visible: true,
    vectorEffectUnsupported: true,
    vectorRasterFallback: { id: "illustration-png", width: 160, height: 160, mtype: "image/png", data: [1, 2, 3] },
  }]);
  const dart = generateFlutterWidget(result.root, [], [], undefined, [], result.assetRegistry, "assets.dart");

  assert.equal(result.assetRegistry[0].type, "png");
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["VECTOR_EFFECT_UNSUPPORTED", "VECTOR_RASTERIZED"]);
  assert.match(dart, /Image\.asset\(/);
  assert.match(dart, /AppAssets\.complexIllustration/);
});

test("keeps component asset references reusable in component output", () => {
  const componentRoot = {
    id: "avatar-root",
    name: "Avatar",
    type: "board",
    x: 0,
    y: 0,
    width: 48,
    height: 48,
    visible: true,
    children: [{
      id: "avatar-photo",
      name: "Avatar Photo",
      type: "image",
      x: 0,
      y: 0,
      width: 48,
      height: 48,
      visible: true,
      fills: [{ fillImage: { id: "avatar-media", width: 96, height: 96, mtype: "image/png" } }],
    }],
  } as const;
  const result = extractSelection([{
    id: "avatar-instance",
    name: "Avatar instance",
    type: "board",
    x: 0,
    y: 0,
    width: 48,
    height: 48,
    visible: true,
    isComponentInstance: true,
    componentId: "avatar-component",
  }], [{ id: "avatar-component", name: "Avatar", root: componentRoot }]);
  const files = generateFlutterFiles(result.root, result.components, [], [], [], undefined, [], undefined, result.assetRegistry);

  assert.equal(result.assetRegistry.length, 1);
  assert.match(files.find((file) => file.path === "components/avatar.dart")!.source, /AppAssets\.avatar/);
  assert.match(files.find((file) => file.path === "assets.dart")!.source, /assets\/images\/avatar\.png/);
});

test("allocates one valid Dart symbol for every asset, including case and punctuation collisions", () => {
  const assets = [
    { id: "highlight-6", sourceNodeId: "node-6", type: "svg" as const, filename: "assets/vectors/highlight-6.svg" },
    { id: "highlight-5", sourceNodeId: "node-5", type: "svg" as const, filename: "assets/vectors/highlight-5.svg" },
    { id: "highlight-copy", sourceNodeId: "node-copy", type: "svg" as const, filename: "assets/vectors/Highlight_5.svg" },
    { id: "numeric", sourceNodeId: "node-numeric", type: "svg" as const, filename: "assets/vectors/1.svg" },
  ];
  const dart = generateFlutterAssets(assets);

  assert.match(dart, /static const highlight5 = 'assets\/vectors\/Highlight_5\.svg';/);
  assert.match(dart, /static const highlight6 = 'assets\/vectors\/highlight-6\.svg';/);
  assert.match(dart, /static const highlight52 = 'assets\/vectors\/highlight-5\.svg';/);
  assert.match(dart, /static const x1 = 'assets\/vectors\/1\.svg';/);
  assert.equal(validateGeneratedDartFiles([{ path: "assets.dart", source: dart }]).length, 0);
  assert.equal((dart.match(/static const /g) ?? []).length, 4);
});

test("reports invalid and duplicate generated Dart declarations", () => {
  const diagnostics = validateGeneratedDartFiles([{
    path: "assets.dart",
    source: "abstract final class AppAssets {\n  static const 112 = 'a';\n  static const cart = 'b';\n  static const Cart = 'c';\n}\n",
  }]);

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), ["DART_INVALID_IDENTIFIER", "DART_DUPLICATE_IDENTIFIER"]);
});

test("does not duplicate pubspec declarations", () => {
  const registry = createAssetRegistry([
    { id: "one", sourceNodeId: "one", type: "webp", semanticName: "Hero", contentHash: "1" },
    { id: "two", sourceNodeId: "two", type: "webp", semanticName: "Hero copy", contentHash: "1" },
  ]);
  const pubspec = generatePubspecSnippet(registry.assets);

  assert.equal((pubspec.match(/assets\/images/g) ?? []).length, 1);
});
