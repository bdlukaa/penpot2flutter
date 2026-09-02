import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";

import { extractSelection, type PenpotSourceShape } from "../src/core/extractor.js";
import { generateComponentWidget, generateFlutterFiles, generateFlutterTypography, generateFlutterWidget, generatePubspecSnippet } from "../src/core/flutter-generator.js";
import { validateFlutterThemeGeneration } from "../src/core/flutter-theme-generator.js";
import { dartMemberName } from "../src/core/token-naming.js";
import { buildTokenRegistry, resolveTokenSets } from "../src/core/token-registry.js";
import { LibraryResolver } from "../src/penpot/library-resolver.js";
import { extractTokenCatalog, extractTokenCatalogIncrementally } from "../src/penpot/token-catalog.js";
import { withTokenBindings } from "../src/penpot/shape-token-bindings.js";
import type { TokenCatalog } from "@penpot/plugin-types";

const board = {
  id: "board-1",
  name: "Welcome screen",
  type: "board",
  x: 0,
  y: 0,
  width: 360,
  height: 240,
  visible: true,
  opacity: 1,
  fills: [{ fillColor: "#FFFFFF", fillOpacity: 1 }],
  children: [
    {
      id: "rectangle-1",
      name: "Primary card",
      type: "rectangle",
      x: 24,
      y: 32,
      width: 312,
      height: 96,
      visible: true,
      opacity: 1,
      fills: [{ fillColor: "#6750A4", fillOpacity: 1 }],
    },
    {
      id: "text-1",
      name: "Welcome message",
      type: "text",
      x: 24,
      y: 152,
      width: 312,
      height: 28,
      visible: true,
      opacity: 1,
      fills: [{ fillColor: "#1D1B20", fillOpacity: 1 }],
      characters: "Hello, Flutter!",
      fontFamily: "Inter",
      fontSize: "24",
      fontWeight: "600",
      lineHeight: "1.1666666666666667",
      letterSpacing: "0",
      align: "left",
    },
  ],
} as const;

test("extracts a serializable board, rectangle, and text IR", () => {
  const result = extractSelection([board]);

  assert.equal(result.root.kind, "board");
  assert.equal(result.root.name, "welcomeScreen");
  assert.equal(result.root.children.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.equal(result.diagnostics.length, 0);
});

test("uses parent coordinates, default opacity, and Penpot line-height factors", () => {
  const result = extractSelection([
    {
      ...board,
      opacity: null,
      children: [{ ...board.children[1], parentX: 5, parentY: 7, opacity: null }],
    },
  ]);
  const dart = generateFlutterWidget(result.root);

  assert.doesNotMatch(dart, /opacity: null/);
  assert.equal(result.root.style.opacity, 1);
  assert.equal(result.root.kind, "board");
  assert.deepEqual(result.root.children[0].geometry, { x: 5, y: 7, width: 312, height: 28 });
  assert.match(dart, /height: 1\.17,/);
});

test("clamps invalid source dimensions and reports a geometry warning", () => {
  const result = extractSelection([
    {
      id: "invalid-rect",
      name: "Invalid rectangle",
      type: "rectangle",
      x: 0,
      y: 0,
      width: -2.8151260504201687,
      height: Number.NaN,
      visible: true,
      opacity: 1,
    },
  ]);

  assert.deepEqual(result.root.geometry, { x: 0, y: 0, width: 0, height: 0 });
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["invalid-geometry"]);
});

test("normalizes direct-child coordinates for a synthetic multi-selection root", () => {
  const result = extractSelection([
    {
      id: "left-card",
      name: "Left card",
      type: "rectangle",
      x: 100,
      y: 50,
      width: 40,
      height: 20,
      visible: true,
      opacity: 1,
    },
    {
      id: "right-card",
      name: "Right card",
      type: "rectangle",
      x: 170,
      y: 70,
      width: 40,
      height: 20,
      visible: true,
      opacity: 1,
    },
  ]);

  assert.equal(result.root.kind, "group");
  assert.deepEqual(result.root.geometry, { x: 0, y: 0, width: 110, height: 40 });
  assert.deepEqual(
    result.root.children.map((child) => [child.geometry.x, child.geometry.y]),
    [[0, 0], [70, 20]],
  );
});

test("reports unsupported shapes rather than silently dropping them", () => {
  const result = extractSelection([
    {
      id: "frame-1",
      name: "Unknown frame",
      type: "frame",
      x: 0,
      y: 0,
      width: 24,
      height: 24,
      visible: true,
      opacity: 1,
    },
  ]);

  assert.equal(result.root.kind, "unsupported");
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["unsupported-shape"]);
});

test("accepts null and malformed Penpot flex values", () => {
  const result = extractSelection([{
    id: "plain-board",
    name: "Plain board",
    type: "board",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    visible: true,
    flex: { dir: null, rowGap: null, columnGap: null, topPadding: null, rightPadding: null, bottomPadding: null, leftPadding: null },
    layoutChild: null,
    children: [],
  }]);

  assert.equal(result.root.kind, "board");
  assert.equal(result.root.flex?.direction, "column");
  assert.deepEqual(result.root.flex?.padding, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.equal(result.root.layoutChild, undefined);
});

test("accepts Penpot null layoutChild values", () => {
  const result = extractSelection([
    {
      id: "plain-board",
      name: "Plain board",
      type: "board",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      visible: true,
      layoutChild: null,
      children: [],
    },
  ]);

  assert.equal(result.root.kind, "board");
  assert.equal(result.root.layoutChild, undefined);
});

test("extracts and generates flex board layouts", () => {
  const result = extractSelection([
    {
      id: "flex-board",
      name: "Action bar",
      type: "board",
      x: 0,
      y: 0,
      width: 360,
      height: 80,
      visible: true,
      flex: {
        dir: "row-reverse",
        rowGap: 12,
        columnGap: 16,
        topPadding: 8,
        rightPadding: 20,
        bottomPadding: 12,
        leftPadding: 24,
        justifyContent: "space-between",
        alignItems: "center",
      },
      children: [
        {
          id: "primary-action",
          name: "Primary action",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          visible: true,
          layoutChild: { absolute: false, horizontalSizing: "fill", verticalSizing: "fill" },
        },
        {
          id: "badge",
          name: "Badge",
          type: "rectangle",
          x: 320,
          y: 4,
          width: 24,
          height: 24,
          visible: true,
          layoutChild: { absolute: true, horizontalSizing: "fix", verticalSizing: "fix" },
        },
      ],
    },
  ]);
  const dart = generateFlutterWidget(result.root);

  assert.equal(result.root.kind, "board");
  assert.deepEqual(result.root.flex, {
    direction: "row-reverse",
    rowGap: 12,
    columnGap: 16,
    padding: { top: 8, right: 20, bottom: 12, left: 24 },
    justifyContent: "space-between",
    alignItems: "center",
  });
  assert.deepEqual(result.root.children[0].layoutChild, {
    absolute: false,
    horizontalSizing: "fill",
    verticalSizing: "fill",
  });
  assert.match(dart, /Stack\(/);
  assert.match(dart, /Positioned\.fill\(/);
  assert.match(dart, /EdgeInsetsDirectional\.only\(top: 8, start: 24, end: 20, bottom: 12\)/);
  assert.match(dart, /Row\(\n\s*textDirection: TextDirection\.rtl,/);
  assert.match(dart, /mainAxisAlignment: MainAxisAlignment\.spaceBetween,/);
  assert.doesNotMatch(dart, /crossAxisAlignment:/);
  assert.match(dart, /Expanded\(/);
  assert.match(dart, /height: double\.infinity,/);
  assert.match(dart, /Positioned\(\n\s*left: 320,/);

  const flexDartPath = new URL("../flex_generated_widget.dart", import.meta.url);
  writeFileSync(flexDartPath, dart);
  assert.doesNotThrow(() => execFileSync("dart", ["format", "-o", "none", flexDartPath.pathname]));
});

test("extracts image shapes and fillImage assets into deterministic Flutter output", () => {
  const result = extractSelection([
    {
      id: "image-board",
      name: "Image board",
      type: "board",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      visible: true,
      children: [
        {
          id: "hero-image",
          name: "Hero image",
          type: "image",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          visible: true,
          fills: [{ fillImage: { id: "media/hero", name: "Hero", width: 400, height: 400, mtype: "image/jpeg", keepAspectRatio: true } }],
        },
        {
          id: "image-fill-rectangle",
          name: "Image fill rectangle",
          type: "rectangle",
          x: 100,
          y: 0,
          width: 100,
          height: 100,
          visible: true,
          fills: [{ fillImage: { id: "media/hero", width: 400, height: 400, mtype: "image/jpeg" } }],
        },
      ],
    },
  ]);
  const dart = generateFlutterWidget(result.root);

  assert.equal(result.root.kind, "board");
  assert.equal(result.root.children[0].kind, "image");
  assert.deepEqual(result.assets, [{
    id: "media/hero",
    name: "Hero",
    mimeType: "image/jpeg",
    width: 400,
    height: 400,
    path: "assets/images/media_2fhero.jpg",
  }]);
  assert.match(dart, /DecorationImage\(\n\s*image: AssetImage\('assets\/images\/media_2fhero\.jpg'\),/);
  assert.match(dart, /fit: BoxFit\.cover,/);
  assert.equal(generatePubspecSnippet(result.assets), "flutter:\n  assets:\n    - assets/images/media_2fhero.jpg\n");
  assert.equal(result.diagnostics.length, 0);

  const imageDartPath = new URL("../image_generated_widget.dart", import.meta.url);
  writeFileSync(imageDartPath, dart);
  assert.doesNotThrow(() => execFileSync("dart", ["format", "-o", "none", imageDartPath.pathname]));
});

test("warns instead of throwing when an image fill is null", () => {
  const result = extractSelection([{
    id: "null-image-fill",
    name: "Null image fill",
    type: "image",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    visible: true,
    fills: [{ fillImage: null }],
  }]);

  assert.deepEqual(result.assets, []);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["unusable-image-id"]);
});

test("warns and omits image fills without a stable image id", () => {
  const result = extractSelection([{
    id: "missing-image-id",
    name: "Missing image ID",
    type: "image",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    visible: true,
    fills: [{ fillImage: { id: "", width: 100, height: 100 } }],
  }]);

  assert.deepEqual(result.assets, []);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["unusable-image-id"]);
  assert.doesNotMatch(generateFlutterWidget(result.root), /AssetImage/);
});

test("generates a column with row gaps without Stack fallback", () => {
  const result = extractSelection([
    {
      id: "flex-column",
      name: "Form",
      type: "board",
      x: 0,
      y: 0,
      width: 200,
      height: 160,
      visible: true,
      flex: {
        dir: "column",
        rowGap: 10,
        columnGap: 0,
        topPadding: 0,
        rightPadding: 0,
        bottomPadding: 0,
        leftPadding: 0,
      },
      children: [
        {
                  id: "field-a",
                  name: "Field a",
                  type: "rectangle",
                  x: 0,
                  y: 0,
                  width: 200,
                  height: 40,
                  visible: true,
                  layoutChild: { absolute: false, horizontalSizing: "fill", verticalSizing: "fix" },
                },
        { id: "field-b", name: "Field b", type: "rectangle", x: 0, y: 50, width: 200, height: 40, visible: true },
      ],
    },
  ]);
  const dart = generateFlutterWidget(result.root);

  assert.match(dart, /Column\(/);
  assert.match(dart, /spacing: 10,/);
  assert.match(dart, /width: double\.infinity,/);
  assert.doesNotMatch(dart, /SizedBox\(height: 10\)/);
  assert.doesNotMatch(dart, /Stack\(/);
});

test("simplifies a stack containing only a no-op layer and one positioned child", () => {
  const result = extractSelection([{
    id: "icon-wrapper",
    name: "Icon wrapper",
    type: "board",
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    visible: true,
    children: [
      { id: "empty-layer", name: "base background", type: "unsupported-shape", x: 0, y: 0, width: 20, height: 20, visible: true },
      { id: "icon", name: "check", type: "path", x: 1.22, y: 1.22, width: 17.09, height: 17.09, visible: true },
    ],
  }]);
  const dart = generateFlutterWidget(result.root);

  assert.doesNotMatch(dart, /Stack\(/);
  assert.match(dart, /Padding\(\n\s*padding: EdgeInsets\.only\(left: 1\.22, top: 1\.22\),/);
  assert.match(dart, /SvgPicture\.asset/);
});

test("normalizes long floating-point values in generated Dart", () => {
  const result = extractSelection([{
    id: "fractional-card",
    name: "Fractional card",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 190.00000000000003,
    height: 230.68965517218118,
    visible: true,
  }]);
  const dart = generateFlutterWidget(result.root);

  assert.match(dart, /width: 190,/);
  assert.match(dart, /height: 230\.69[,)]/);
  assert.doesNotMatch(dart, /230\.68965517218118/);
});

test("keeps multiline Penpot titles inside single-line Dart comments", () => {
  const result = extractSelection([{
    id: "multiline-title",
    name: "Group",
    type: "board",
    x: 0,
    y: 0,
    width: 200,
    height: 168,
    visible: true,
    children: [{
      id: "multiline-layer",
      name: "#333333\n#808080\nlinear\n45deg",
      type: "rectangle",
      x: 0,
      y: 92,
      width: 200,
      height: 76,
      visible: true,
    }],
  }]);
  const dart = generateFlutterWidget(result.root);

  assert.match(dart, /\/\/ #333333 #808080 linear 45deg/);
  assert.doesNotMatch(dart, /\n#808080|\nlinear|\n45deg/);
  const dartPath = new URL("../multiline_title.dart", import.meta.url);
  writeFileSync(dartPath, dart);
  assert.doesNotThrow(() => execFileSync("dart", ["format", "-o", "none", dartPath.pathname]));
});

test("generates deterministic compilable Flutter widget source", () => {
  const result = extractSelection([board]);
  const dart = generateFlutterWidget(result.root);

  assert.match(dart, /^import 'package:flutter\/material.dart';/);
  assert.match(dart, /class WelcomeScreen extends StatelessWidget/);
  assert.match(dart, /Color\(0xff6750a4\)/);
  assert.match(dart, /Text\(\n\s*'Hello, Flutter!'/);
  assert.match(dart, /fontFamily: 'Inter'/);
  assert.match(dart, /Positioned\(\n\s*left: 24/);
  assert.equal(dart, generateFlutterWidget(result.root));

  const generatedDartPath = new URL("../generated_widget.dart", import.meta.url);
  writeFileSync(generatedDartPath, dart);
  assert.doesNotThrow(() => execFileSync("dart", ["format", "-o", "none", generatedDartPath.pathname]));
});

test("emits code that already matches dart format", () => {
  const dart = generateFlutterWidget(extractSelection([board]).root);
  const dartPath = new URL("../dart_format_golden.dart", import.meta.url);
  writeFileSync(dartPath, dart);
  execFileSync("dart", ["format", dartPath.pathname]);
  assert.equal(dart, readFileSync(dartPath, "utf8"));
});

test("extracts and generates solid strokes, per-corner radii, and drop shadows", () => {
  const result = extractSelection([{
    ...board,
    id: "styled-board",
    name: "Styled card",
    flex: {
      dir: "row",
      rowGap: 0,
      columnGap: 8,
      topPadding: 0,
      rightPadding: 0,
      bottomPadding: 0,
      leftPadding: 0,
    },
    fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
    strokes: [{ strokeColor: "#6750A4", strokeOpacity: 0.75, strokeStyle: "solid", strokeWidth: 2 }],
    borderRadius: 12,
    borderRadiusTopLeft: 4,
    borderRadiusTopRight: 8,
    borderRadiusBottomRight: 12,
    borderRadiusBottomLeft: 16,
    shadows: [{
      style: "drop-shadow",
      offsetX: 2,
      offsetY: 4,
      blur: 6,
      spread: 1,
      color: { color: "#000000", opacity: 0.25 },
    }],
    children: [{
      ...board.children[0],
      fills: [{ fillImage: { id: "media/styled-card", name: "Styled card", width: 400, height: 300, mtype: "image/png", keepAspectRatio: true } }],
      strokes: [{ strokeColor: "#6750A4", strokeOpacity: 0.75, strokeStyle: "solid", strokeWidth: 2 }],
      borderRadiusTopLeft: 4,
      borderRadiusTopRight: 8,
      borderRadiusBottomRight: 12,
      borderRadiusBottomLeft: 16,
      shadows: [{
        style: "drop-shadow",
        offsetX: 2,
        offsetY: 4,
        blur: 6,
        spread: 1,
        color: { color: "#000000", opacity: 0.25 },
      }],
    }],
  }]);
  const dart = generateFlutterWidget(result.root);

  assert.deepEqual(result.root.style.border, { color: "#6750a4", opacity: 0.75, width: 2 });
  assert.deepEqual(result.root.style.radius, { topLeft: 4, topRight: 8, bottomRight: 12, bottomLeft: 16 });
  assert.deepEqual(result.root.style.shadows, [{
    color: "#000000",
    opacity: 0.25,
    offsetX: 2,
    offsetY: 4,
    blur: 6,
    spread: 1,
  }]);
  assert.match(dart, /Border\.all\(color: Color\(0xbf6750a4\), width: 2\)/);
  assert.match(dart, /BorderRadius\.only\(\n\s*topLeft: Radius\.circular\(4\),/);
  assert.match(dart, /boxShadow: \[\n\s*BoxShadow\(/);
  assert.match(dart, /offset: Offset\(2, 4\),/);
  assert.match(dart, /blurRadius: 6,/);
  assert.match(dart, /spreadRadius: 1,/);
  assert.match(dart, /Row\(/);
  assert.doesNotMatch(dart, /Stack\(/);

  const styledDartPath = new URL("../styled_generated_widget.dart", import.meta.url);
  writeFileSync(styledDartPath, dart);
  execFileSync("dart", ["format", styledDartPath.pathname]);
  assert.equal(dart, readFileSync(styledDartPath, "utf8"));
});

test("extracts and generates ellipses, gradients, and transforms", () => {
  const result = extractSelection([{
    id: "gradient-orb",
    name: "Gradient orb",
    type: "ellipse",
    x: 0,
    y: 0,
    width: 80,
    height: 48,
    visible: true,
    rotation: 45,
    flipX: true,
    fills: [{
      fillColorGradient: {
        type: "linear",
        startX: 0,
        startY: 0,
        endX: 1,
        endY: 1,
        width: 1,
        stops: [
          { color: "#ff0000", opacity: 1, offset: 0 },
          { color: "#0000ff", opacity: 0.5, offset: 1 },
        ],
      },
    }],
  }]);
  const dart = generateFlutterWidget(result.root);

  assert.equal(result.root.kind, "ellipse");
  assert.equal(result.root.style.gradient?.type, "linear");
  assert.deepEqual(result.root.transform, { rotation: 45, flipX: true, flipY: false });
  assert.match(dart, /import 'dart:math' as math;/);
  assert.match(dart, /Transform\.rotate\(\n\s*angle: 45 \* math\.pi \/ 180,/);
  assert.match(dart, /Matrix4\.diagonal3Values\(-1, 1, 1\)/);
  assert.match(dart, /ClipOval\(/);
  assert.match(dart, /LinearGradient\(/);
  assert.match(dart, /Color\(0x80?0000ff\)/);

  const transformedDartPath = new URL("../transformed_generated_widget.dart", import.meta.url);
  writeFileSync(transformedDartPath, dart);
  execFileSync("dart", ["format", transformedDartPath.pathname]);
  assert.equal(dart, readFileSync(transformedDartPath, "utf8"));
});

test("generates a simple grid and falls back with diagnostics for unsupported grid semantics", () => {
  const supported = extractSelection([{
    id: "catalogue",
    name: "Catalogue",
    type: "board",
    x: 0,
    y: 0,
    width: 240,
    height: 120,
    visible: true,
    grid: {
      dir: "row",
      rows: [{ type: "flex", value: 1 }],
      columns: [{ type: "flex", value: 1 }, { type: "flex", value: 1 }],
      rowGap: 8,
      columnGap: 12,
      topPadding: 4,
      rightPadding: 4,
      bottomPadding: 4,
      leftPadding: 4,
    },
    children: [
      { id: "card-one", name: "Card one", type: "rectangle", x: 0, y: 0, width: 100, height: 100, visible: true },
      { id: "card-two", name: "Card two", type: "rectangle", x: 120, y: 0, width: 100, height: 100, visible: true },
    ],
  }]);
  const fallback = extractSelection([{
    id: "spanning-grid",
    name: "Spanning grid",
    type: "board",
    x: 0,
    y: 0,
    width: 240,
    height: 120,
    visible: true,
    grid: {
      dir: "row",
      rows: [{ type: "fixed", value: 60 }],
      columns: [{ type: "flex", value: 1 }, { type: "flex", value: 1 }],
      rowGap: 0,
      columnGap: 0,
      topPadding: 0,
      rightPadding: 0,
      bottomPadding: 0,
      leftPadding: 0,
    },
    children: [{
      id: "spanning-card",
      name: "Spanning card",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 120,
      height: 60,
      visible: true,
      layoutCell: { row: 0, column: 0, columnSpan: 2, position: "manual" },
    }],
  }]);

  assert.equal(supported.root.kind, "board");
  assert.equal(supported.root.grid?.supported, true);
  assert.match(generateFlutterWidget(supported.root), /GridView\.count\(/);
  assert.equal(fallback.root.kind, "board");
  assert.equal(fallback.root.grid?.supported, false);
  assert.match(fallback.diagnostics.map((diagnostic) => diagnostic.code).join(","), /unsupported-grid/);
  assert.match(generateFlutterWidget(fallback.root), /Stack\(/);
});

test("extracts and generates rich text runs as RichText spans", () => {
  const result = extractSelection([{
    id: "rich-text",
    name: "Rich caption",
    type: "text",
    x: 0,
    y: 0,
    width: 200,
    height: 40,
    visible: true,
    characters: "Bold and italic",
    fontFamily: "mixed",
    fontSize: "mixed",
    runs: [
      {
        characters: "Bold",
        fontFamily: "Karla",
        fontSize: "16",
        fontWeight: "700",
        fontStyle: "normal",
        textDecoration: "none",
        fills: [{ fillColor: "#352922", fillOpacity: 1 }],
      },
      {
        characters: " and ",
        fontFamily: "Karla",
        fontSize: "16",
        fontWeight: "400",
        fontStyle: "normal",
        textDecoration: "none",
        fills: [{ fillColor: "#352922", fillOpacity: 1 }],
      },
      {
        characters: "italic",
        fontFamily: "Karla",
        fontSize: "16",
        fontWeight: "400",
        fontStyle: "italic",
        textDecoration: "underline",
        fills: [{ fillColor: "#6750a4", fillOpacity: 1 }],
      },
    ],
  }]);
  const dart = generateFlutterWidget(result.root);

  assert.equal(result.root.kind, "text");
  assert.equal(result.root.runs?.length, 3);
  assert.equal(result.diagnostics.filter((diagnostic) => diagnostic.code === "mixed-text-style").length, 0);
  assert.match(dart, /RichText\(/);
  assert.match(dart, /TextSpan\(/);
  assert.match(dart, /fontWeight: FontWeight\.w700,/);
  assert.match(dart, /fontStyle: FontStyle\.italic,/);
  assert.match(dart, /decoration: TextDecoration\.underline,/);
  assert.doesNotMatch(dart, /child: Text\(/);

  const richTextPath = new URL("../rich_text_generated_widget.dart", import.meta.url);
  writeFileSync(richTextPath, dart);
  execFileSync("dart", ["format", richTextPath.pathname]);
  assert.equal(dart, readFileSync(richTextPath, "utf8"));
});

test("extracts single-run fontStyle and decoration for plain text", () => {
  const result = extractSelection([{
    id: "plain-italic",
    name: "Italic label",
    type: "text",
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    visible: true,
    characters: "italic underline",
    fontFamily: "Karla",
    fontSize: "14",
    fontWeight: "400",
    fontStyle: "italic",
    textDecoration: "underline",
  }]);
  const dart = generateFlutterWidget(result.root);

  assert.match(dart, /Text\(/);
  assert.match(dart, /fontStyle: FontStyle\.italic,/);
  assert.match(dart, /decoration: TextDecoration\.underline,/);
});

test("extracts vector paths and svg-raw nodes as SvgPicture assets", () => {
  const result = extractSelection([{
    id: "logo-vector",
    name: "Logo vector",
    type: "path",
    x: 0,
    y: 0,
    width: 24,
    height: 24,
    visible: true,
  }]);
  const dart = generateFlutterWidget(result.root);

  assert.equal(result.root.kind, "svg");
  assert.equal(result.root.assetPath, "assets/images/logo-vector.svg");
  assert.deepEqual(result.assets, [{
    id: "logo-vector",
    mimeType: "image/svg+xml",
    width: 24,
    height: 24,
    path: "assets/images/logo-vector.svg",
  }]);
  assert.equal(result.diagnostics.length, 0);
  assert.match(dart, /SvgPicture\.asset\(/);
  assert.match(dart, /'assets\/images\/logo-vector\.svg',/);
  assert.match(dart, /width: 24,/);
  assert.match(dart, /height: 24,/);
  assert.equal(generatePubspecSnippet(result.assets), "dependencies:\n  flutter_svg: ^2.3.0\n\nflutter:\n  assets:\n    - assets/images/logo-vector.svg\n");

  const svgDartPath = new URL("../svg_generated_widget.dart", import.meta.url);
  writeFileSync(svgDartPath, dart);
  execFileSync("dart", ["format", svgDartPath.pathname]);
  assert.equal(dart, readFileSync(svgDartPath, "utf8"));
});

test("extracts svg-raw and boolean nodes as SvgPicture assets", () => {
  const result = extractSelection([
    { id: "raw-svg", name: "Raw svg", type: "svg-raw", x: 0, y: 0, width: 16, height: 16, visible: true },
    { id: "bool-shape", name: "Boolean shape", type: "boolean", x: 0, y: 0, width: 32, height: 32, visible: true },
  ]);
  const dart = generateFlutterWidget(result.root);

  assert.match(dart, /SvgPicture\.asset\(/);
  assert.match(dart, /'assets\/images\/raw-svg\.svg',/);
  assert.match(dart, /'assets\/images\/bool-shape\.svg',/);
  assert.equal(result.diagnostics.length, 0);
});

test("renders square ellipses as a circle decoration without ClipOval", () => {
  const result = extractSelection([{
    id: "circle-avatar",
    name: "Circle avatar",
    type: "ellipse",
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    visible: true,
    fills: [{ fillColor: "#6750a4", fillOpacity: 1 }],
  }]);
  const dart = generateFlutterWidget(result.root);

  assert.equal(result.root.kind, "ellipse");
  assert.match(dart, /shape: BoxShape\.circle,/);
  assert.doesNotMatch(dart, /ClipOval\(/);

  const circlePath = new URL("../circle_generated_widget.dart", import.meta.url);
  writeFileSync(circlePath, dart);
  execFileSync("dart", ["format", circlePath.pathname]);
  assert.equal(dart, readFileSync(circlePath, "utf8"));
});

test("emits SizedBox without clipBehavior for decoration-less boards", () => {
  const result = extractSelection([{
    id: "plain-board",
    name: "Plain board",
    type: "board",
    x: 0,
    y: 0,
    width: 180,
    height: 20,
    visible: true,
    clipContent: true,
    children: [{
      id: "plain-child",
      name: "Plain child",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 50,
      height: 20,
      visible: true,
    }],
  }]);
  const dart = generateFlutterWidget(result.root);

  assert.doesNotMatch(dart, /Container\(/);
  assert.doesNotMatch(dart, /clipBehavior:/);
  assert.match(dart, /SizedBox\(\n\s*width: 180,\n\s*height: 20,/);
});

test("preserves Penpot stacking order when live children expose zIndex", () => {
  const result = extractSelection([{
    id: "ordered-board",
    name: "Ordered",
    type: "board",
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    visible: true,
    flex: { dir: "row", rowGap: 0, columnGap: 0, topPadding: 0, rightPadding: 0, bottomPadding: 0, leftPadding: 0 },
    children: [
      { id: "text", name: "Text", type: "text", x: 20, y: 0, width: 80, height: 20, visible: true, characters: "Text", zIndex: 0 },
      { id: "icon", name: "Icon", type: "rectangle", x: 0, y: 0, width: 20, height: 20, visible: true, zIndex: 1 },
    ],
  }]);
  assert.deepEqual(result.root.kind === "board" ? result.root.children.map((child) => child.sourceName) : [], ["Icon", "Text"]);
});

// --- Shared library resolution fixtures ---

test("resolves a connected shared component without listing available libraries", async () => {
  let availableCalls = 0;
  const component = { id: "button", libraryId: "design-system", name: "Button", mainInstance: () => ({}) };
  const resolver = new LibraryResolver({
    local: { id: "local", name: "Local", components: [] },
    connected: [{ id: "design-system", name: "Design System", components: [component] }],
    availableLibraries: async () => { availableCalls++; return []; },
  });

  const result = await resolver.resolve({ componentId: "button", libraryId: "design-system" });
  assert.equal(result.status, "resolved");
  assert.equal(availableCalls, 0);
});

test("uses a directly resolved shape component without global scans", async () => {
  let availableCalls = 0;
  const component = { id: "button", libraryId: "design-system", name: "Button", mainInstance: () => ({}) };
  const resolver = new LibraryResolver({
    local: { id: "local", name: "Local", components: [] },
    connected: [],
    availableLibraries: async () => { availableCalls++; return []; },
  });

  const result = await resolver.resolve({ directComponent: component });
  assert.equal(result.status, "resolved");
  assert.equal(availableCalls, 0);
});

test("reports an available but disconnected shared library without connecting it", async () => {
  let availableCalls = 0;
  const resolver = new LibraryResolver({
    local: { id: "local", name: "Local", components: [] },
    connected: [],
    availableLibraries: async () => { availableCalls++; return [{ id: "design-system", name: "Design System" }]; },
  });

  const result = await resolver.resolve({ componentId: "button", libraryId: "design-system" });
  assert.deepEqual(result, { status: "library-not-connected", componentId: "button", library: { id: "design-system", name: "Design System" } });
  assert.equal(availableCalls, 1);
});

test("relinks a uniquely renamed component by same-library path and name", async () => {
  const component = { id: "new-button", libraryId: "design-system", name: "UI / text button", path: "Buttons/UI / text button", mainInstance: () => ({}) };
  const resolver = new LibraryResolver({
    local: { id: "local", name: "Local", components: [] },
    connected: [{ id: "design-system", name: "Design System", components: [component] }],
    availableLibraries: async () => [],
  });

  const result = await resolver.resolve({
    componentId: "old-button",
    libraryId: "design-system",
    componentName: "UI / text button",
    componentPath: "Buttons/UI / text button",
  });
  assert.equal(result.status, "resolved");
  if (result.status === "resolved") {
    assert.equal(result.source, "relinked");
    assert.equal(result.component.id, "new-button");
  }
});

test("does not connect an available shared library because conversion is read-only", async () => {
  let connectionCalls = 0;
  const resolver = new LibraryResolver({
    local: { id: "local", name: "Local", components: [] },
    connected: [],
    availableLibraries: async () => [{ id: "design-system", name: "Design System" }],
    connectLibrary: async () => { connectionCalls++; throw new Error("must not connect"); },
  });

  const results = await Promise.all([
    resolver.resolve({ componentId: "button", libraryId: "design-system" }),
    resolver.resolve({ componentId: "button", libraryId: "design-system" }),
  ]);
  assert.equal(results[0].status, "library-not-connected");
  assert.equal(results[1].status, "library-not-connected");
  assert.equal(connectionCalls, 0);
});

test("reports a missing component in a connected shared library", async () => {
  const resolver = new LibraryResolver({
    local: { id: "local", name: "Local", components: [] },
    connected: [{ id: "design-system", name: "Design System", components: [] }],
    availableLibraries: async () => [],
  });

  const result = await resolver.resolve({ componentId: "missing", libraryId: "design-system" });
  assert.equal(result.status, "component-not-found");
});

test("caches unavailable-library resolution", async () => {
  let availableCalls = 0;
  const resolver = new LibraryResolver({
    local: { id: "local", name: "Local", components: [] },
    connected: [],
    availableLibraries: async () => { availableCalls++; return []; },
  });

  await Promise.all([
    resolver.resolve({ componentId: "button", libraryId: "missing" }),
    resolver.resolve({ componentId: "button", libraryId: "missing" }),
  ]);
  assert.equal(availableCalls, 1);
});

// --- Component support fixtures ---

const buttonMain = {
  id: "button-main",
  name: "Primary Button",
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
};

function buttonInstance(id: string, label: string) {
  return {
    id,
    name: "Primary Button",
    type: "board",
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    visible: true,
    isComponentInstance: true,
    componentId: "comp-button",
    children: [{
      id: `${id}-label`,
      name: "Label",
      type: "text",
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      visible: true,
      characters: label,
      fontSize: "16",
    }],
  };
}

test("maps a multi-axis variant family to one typed Flutter component", () => {
  const member = (id: string, fillColor: string) => ({
    id,
    name: id,
    type: "board",
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    visible: true,
    fills: [{ fillColor, fillOpacity: 1 }],
    children: buttonMain.children,
  });
  const primarySmall = member("primary-small", "#0000ff");
  const primaryLarge = member("primary-large", "#0000cc");
  const secondaryLarge = member("secondary-large", "#eeeeee");
  const result = extractSelection(
    [{ ...buttonInstance("variant-instance", "Buy now"), componentId: "secondary-large", componentLibraryId: "design-system" }],
    [
      { id: "primary-small", libraryId: "design-system", name: "Primary small", root: primarySmall },
      { id: "primary-large", libraryId: "design-system", name: "Primary large", root: primaryLarge },
      { id: "secondary-large", libraryId: "design-system", name: "Secondary large", root: secondaryLarge },
    ],
    [{
      id: "button-family",
      libraryId: "design-system",
      name: "Button",
      properties: ["Style", "Size"],
      defaultComponentId: "primary-small",
      members: [
        { id: "primary-small", libraryId: "design-system", name: "Primary small", root: primarySmall, values: { Style: "Primary", Size: "Small" } },
        { id: "primary-large", libraryId: "design-system", name: "Primary large", root: primaryLarge, values: { Style: "Primary", Size: "Large" } },
        { id: "secondary-large", libraryId: "design-system", name: "Secondary large", root: secondaryLarge, values: { Style: "Secondary", Size: "Large" } },
      ],
    }],
  );

  assert.equal(result.components.length, 1);
  const component = result.components[0];
  assert.equal(component.name, "PenpotButton");
  assert.deepEqual(component.variant?.axes.map((axis) => axis.enumName), ["PenpotButtonStyle", "PenpotButtonSize"]);
  assert.equal(component.variant?.members.length, 3);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "VARIANT_SPARSE_MATRIX"));
  assert.equal(result.root.kind, "component-instance");
  assert.equal(result.root.componentId, "design-system:variant-button-family");
  assert.deepEqual(result.root.variantValues?.map((selection) => selection.valueName), ["secondary", "large"]);

  const componentDart = generateComponentWidget(component, result.components);
  assert.match(componentDart, /enum PenpotButtonStyle \{/);
  assert.match(componentDart, /enum PenpotButtonSize \{/);
  assert.doesNotMatch(componentDart, /enum PenpotButtonVariant \{/);
  assert.match(componentDart, /this\.style = PenpotButtonStyle\.primary,/);
  assert.match(componentDart, /this\.size = PenpotButtonSize\.small,/);
  assert.match(componentDart, /return switch \(\(style, size\)\)/);
  assert.match(componentDart, /_ => throw ArgumentError\('Unsupported PenpotButton variant combination'\)/);
  assert.match(generateFlutterWidget(result.root, result.components), /PenpotButton\(\n\s*style: PenpotButtonStyle\.secondary,\n\s*size: PenpotButtonSize\.large,\n\s*label: 'Buy now',/);

  const variantDartPath = new URL("../variant_button.dart", import.meta.url);
  writeFileSync(variantDartPath, componentDart);
  assert.doesNotThrow(() => execFileSync("dart", ["format", "-o", "none", variantDartPath.pathname]));
});

test("maps a Penpot component to a reusable widget and instances to invocations", () => {
  const result = extractSelection(
    [buttonInstance("i1", "Buy now"), buttonInstance("i2", "Continue"), buttonInstance("i3", "Cancel")],
    [{ id: "comp-button", name: "Primary Button", root: buttonMain }],
  );

  assert.equal(result.components.length, 1);
  const component = result.components[0];
  assert.equal(component.name, "PrimaryButton");
  assert.deepEqual(component.parameters, [{ name: "label", type: "String", defaultValue: "Continue" }]);
  assert.equal(component.dependencies.length, 0);
  assert.equal(result.root.kind, "group");
  assert.equal(result.root.children.length, 3);
  assert.equal(result.root.children[0].kind, "component-instance");

  const componentDart = generateComponentWidget(component, result.components);
  assert.match(componentDart, /class PrimaryButton extends StatelessWidget/);
  assert.match(componentDart, /this\.label = 'Continue',/);
  assert.match(componentDart, /final String label;/);
  assert.match(componentDart, /Text\(\n\s*this\.label,/);

  const dart = generateFlutterWidget(result.root, result.components);
  assert.match(dart, /PrimaryButton\(\n\s*label: 'Buy now',/);
  assert.match(dart, /PrimaryButton\(\)/);
  assert.match(dart, /PrimaryButton\(\n\s*label: 'Cancel',/);
  assert.doesNotMatch(dart, /label: 'Continue'/);
});

test("preserves non-enumerable children from Penpot component proxies", () => {
  const proxyLikeMain = { ...buttonMain };
  Object.defineProperty(proxyLikeMain, "children", {
    enumerable: false,
    value: [{ id: "background", name: "Background", type: "rectangle", x: 0, y: 0, width: 40, height: 40, visible: true }],
  });
  const result = extractSelection(
    [{ ...buttonInstance("instance", "Continue"), componentLibraryId: "library-a" }],
    [{ id: "comp-button", libraryId: "library-a", name: "Primary Button", root: proxyLikeMain }],
  );

  const component = result.components[0];
  assert.equal(component.root.kind, "board");
  assert.equal(component.root.children.length, 1);
  assert.equal(component.root.children[0].sourceName, "Background");
});

test("preserves non-enumerable children while adding shape token bindings", () => {
  const proxyLikeShape = { id: "token-parent", name: "Token parent", type: "board", x: 0, y: 0, width: 40, height: 40, visible: true };
  const children = [{ id: "instance", name: "Button", type: "rectangle", x: 0, y: 0, width: 40, height: 40, visible: true }];
  Object.defineProperty(proxyLikeShape, "children", { enumerable: false, value: children });
  const enriched = withTokenBindings(proxyLikeShape, { fill: "color.primary" });
  assert.equal(enriched.children, children);
  assert.deepEqual(enriched.tokenBindings, { fill: "color.primary" });
});

test("keeps layers inside a component tree as ordinary component content", () => {
  const mainWithInternalLayer = {
    ...buttonMain,
    children: [{
      id: "button-background",
      name: "Background",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      visible: true,
      isComponentInstance: true,
      isComponentRoot: false,
      componentId: "comp-button",
    }],
  };
  const result = extractSelection(
    [{ ...buttonInstance("instance", "Continue"), componentLibraryId: "library-a" }],
    [{ id: "comp-button", libraryId: "library-a", name: "Primary Button", root: mainWithInternalLayer }],
  );

  const component = result.components[0];
  assert.equal(component.root.kind, "board");
  assert.equal(component.root.children[0].kind, "rectangle");
  assert.deepEqual(component.dependencies, []);
});

test("exports a selected main component as a reusable component call", () => {
  const mainInstanceRoot = {
    ...buttonMain,
    isComponentMainInstance: true,
    isComponentRoot: true,
    componentId: "comp-button",
  };
  const result = extractSelection(
    [mainInstanceRoot],
    [{ id: "comp-button", name: "Primary Button", root: buttonMain }],
  );
  assert.equal(result.root.kind, "component-instance");
  assert.equal(result.components.length, 1);
  assert.match(generateFlutterWidget(result.root, result.components), /PrimaryButton\(\)/);
  assert.match(generateFlutterFiles(result.root, result.components)[1].source, /class PrimaryButton extends StatelessWidget/);
});

test("extracts a canonical main-instance root instead of calling itself", () => {
  const mainInstanceRoot = {
    ...buttonMain,
    isComponentInstance: true,
    isComponentMainInstance: true,
    componentId: "comp-button",
    componentLibraryId: "library-a",
  };
  const result = extractSelection(
    [{ ...buttonInstance("instance", "Continue"), componentLibraryId: "library-a" }],
    [{ id: "comp-button", libraryId: "library-a", name: "Primary Button", root: mainInstanceRoot }],
  );

  const component = result.components[0];
  assert.deepEqual(component.dependencies, []);
  assert.doesNotMatch(generateComponentWidget(component, result.components), /PrimaryButton\(\)/);
  assert.doesNotMatch(result.diagnostics.map((diagnostic) => diagnostic.code).join(","), /COMPONENT_DEPENDENCY_CYCLE/);
});

test("preserves nested component instances as dependencies", () => {
  const cardMain = {
    id: "card-main",
    name: "Product Card",
    type: "board",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    visible: true,
    children: [
      { id: "card-name", name: "Product name", type: "text", x: 0, y: 0, width: 200, height: 40, visible: true, characters: "Coffee", fontSize: "16" },
      {
        id: "card-button",
        name: "Primary Button",
        type: "board",
        x: 0,
        y: 40,
        width: 120,
        height: 40,
        visible: true,
        isComponentInstance: true,
        componentId: "comp-button",
        children: [{ id: "card-button-label", name: "Label", type: "text", x: 0, y: 0, width: 120, height: 40, visible: true, characters: "Continue", fontSize: "16" }],
      },
    ],
  };
  const result = extractSelection(
    [{ id: "card-instance", name: "Product Card", type: "board", x: 0, y: 0, width: 200, height: 100, visible: true, isComponentInstance: true, componentId: "comp-card", children: cardMain.children }],
    [
      { id: "comp-button", name: "Primary Button", root: buttonMain },
      { id: "comp-card", name: "Product Card", root: cardMain },
    ],
  );

  const card = result.components.find((component) => component.id === "local:comp-card")!;
  assert.deepEqual(card.dependencies, ["local:comp-button"]);
  const cardDart = generateComponentWidget(card, result.components);
  assert.match(cardDart, /PrimaryButton\(\)/);
});

test("keeps components with the same ID from separate libraries distinct", () => {
  const localButton = { ...buttonMain, id: "local-button-main", name: "Local Button" };
  const sharedButton = { ...buttonMain, id: "shared-button-main", name: "Shared Button" };
  const result = extractSelection(
    [
      { ...buttonInstance("local-instance", "Continue"), componentId: "button", componentLibraryId: "local-library" },
      { ...buttonInstance("shared-instance", "Continue"), componentId: "button", componentLibraryId: "shared-library" },
    ],
    [
      { id: "button", libraryId: "local-library", name: "Local Button", root: localButton },
      { id: "button", libraryId: "shared-library", name: "Shared Button", root: sharedButton },
    ],
  );

  assert.deepEqual(result.components.map((component) => component.id), ["local-library:button", "shared-library:button"]);
  assert.deepEqual(result.root.kind === "group" ? result.root.children.map((child) => child.kind === "component-instance" ? child.componentId : "") : [], ["local-library:button", "shared-library:button"]);
  assert.match(generateFlutterWidget(result.root, result.components), /LocalButton\(\)/);
  assert.match(generateFlutterWidget(result.root, result.components), /SharedButton\(\)/);
});

test("disambiguates colliding component names deterministically", () => {
  const make = (id: string) => ({ id, name: "Button", root: buttonMain });
  const result = extractSelection(
    [{ id: "a", name: "Button", type: "board", x: 0, y: 0, width: 120, height: 40, visible: true, isComponentInstance: true, componentId: "c1", children: buttonMain.children }],
    [make("c1"), make("c2")],
  );

  const names = result.components.map((component) => component.name);
  assert.equal(new Set(names).size, 2);
  assert.equal(names[0], "PenpotButton");
  assert.equal(names[1], "PenpotButton2");
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "COMPONENT_NAME_COLLISION"));
});

test("treats detached instances as ordinary shape trees", () => {
  const result = extractSelection([buttonMain]);
  assert.equal(result.components.length, 0);
  assert.equal(result.root.kind, "board");
  assert.equal(result.root.children[0].kind, "text");
});

test("preserves component fill overrides as a color parameter", () => {
  const redButton = {
    ...buttonMain,
    id: "red-button-main",
    fills: [{ fillColor: "#6750a4", fillOpacity: 1 }],
  };
  const redInstance = {
    ...buttonInstance("red-i", "Continue"),
    fills: [{ fillColor: "#ff0000", fillOpacity: 1 }],
  };
  const result = extractSelection([redInstance], [{ id: "comp-button", name: "Primary Button", root: redButton }]);

  assert.doesNotMatch(result.diagnostics.map((diagnostic) => diagnostic.code).join("\n"), /COMPONENT_OVERRIDE_UNSUPPORTED/);
  const dart = generateFlutterWidget(result.root, result.components);
  assert.match(dart, /PrimaryButton\(\n\s*backgroundColor: Color\(0xffff0000\),/);
  assert.match(generateComponentWidget(result.components[0], result.components), /final Color\? backgroundColor;/);
  assert.match(generateComponentWidget(result.components[0], result.components), /this\.backgroundColor \?\? Color\(0xff6750a4\)/);
});

test("reports unresolved components and falls back safely", () => {
  const result = extractSelection([buttonInstance("orphan", "Continue")]);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "COMPONENT_UNRESOLVED"));
  assert.equal(result.root.kind, "unsupported");
  assert.match(generateFlutterWidget(result.root, result.components), /const SizedBox\.shrink\(\)/);
});

test("reports unavailable shared-library components", () => {
  const result = extractSelection([{ ...buttonInstance("library-orphan", "Continue"), componentLibraryId: "shared-library" }]);

  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "SHARED_LIBRARY_UNAVAILABLE"));
  assert.equal(result.root.kind, "unsupported");
});

test("generates deterministic multi-file output with a barrel export", () => {
  const cardMain = {
    id: "card-main",
    name: "Product Card",
    type: "board",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    visible: true,
    children: [
      { id: "card-button", name: "Primary Button", type: "board", x: 0, y: 0, width: 120, height: 40, visible: true, isComponentInstance: true, componentId: "comp-button", children: buttonMain.children },
    ],
  };
  const result = extractSelection(
    [{
      id: "checkout-screen",
      name: "Checkout Screen",
      type: "board",
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      visible: true,
      children: [buttonInstance("top", "Checkout")],
    }],
    [
      { id: "comp-button", name: "Primary Button", root: buttonMain },
      { id: "comp-card", name: "Product Card", root: cardMain },
    ],
  );

  const files = generateFlutterFiles(result.root, result.components);
  const paths = files.map((file) => file.path);
  assert.deepEqual(paths, ["screens/checkout_screen.dart", "components/primary_button.dart", "components/product_card.dart", "penpot.dart"]);
  assert.match(files.find((file) => file.path === "penpot.dart")!.source, /export 'components\/primary_button\.dart';/);

  const again = generateFlutterFiles(result.root, result.components);
  assert.deepEqual(again, files);
});

test("generates typed theme fields and component references from semantic token names", () => {
  const tokenBoard = {
    id: "token-board", name: "Token Card", type: "board", x: 0, y: 0, width: 200, height: 100, visible: true,
    flex: { dir: "column", rowGap: 16, topPadding: 16, rightPadding: 16, bottomPadding: 16, leftPadding: 16 },
    tokenBindings: { rowGap: "space.modular.lg", paddingTop: "space.modular.lg", paddingRight: "space.modular.lg", paddingBottom: "space.modular.lg", paddingLeft: "space.modular.lg" },
    children: [{
      id: "token-card", name: "Card", type: "rectangle", x: 0, y: 0, width: 168, height: 68, visible: true,
      fills: [{ fillColor: "#eaf4ff", fillOpacity: 1 }], borderRadius: 12,
      tokenBindings: { fill: "color.info.background", borderRadius: "radius.modular.sm" },
    }],
  } as const;
  const result = extractSelection([tokenBoard], [], [], {
    tokens: [
      { id: "color", name: "color.info.background", type: "color", value: "#eaf4ff", setId: "light" },
      { id: "primary", name: "color.primary", type: "color", value: "#6750a4", setId: "light" },
      { id: "space", name: "space.modular.lg", type: "spacing", value: 16, setId: "global" },
      { id: "radius", name: "radius.modular.sm", type: "border-radius", value: 12, setId: "global" },
      { id: "motion", name: "motion.duration.fast", type: "duration", value: 150, setId: "global" },
    ],
    sets: [
      { id: "global", name: "Global", active: true, tokenIds: ["space", "radius", "motion"] },
      { id: "light", name: "Light", tokenIds: ["color", "primary"] },
    ],
    themes: [{ id: "light-theme", name: "Light", group: "Mode", active: true, activeSetIds: ["global", "light"] }],
  });

  const files = generateFlutterFiles(result.root, result.components, result.tokens, result.tokenSets, result.tokenThemes);
  const screen = files.find((file) => file.path === "screens/token_card.dart")!.source;
  const namespaces = files.find((file) => file.path === "theme/penpot_token_namespaces.dart")!.source;
  const extension = files.find((file) => file.path === "theme/penpot_tokens.dart")!.source;
  const themes = files.find((file) => file.path === "theme/penpot_themes.dart")!.source;
  assert.match(screen, /context\.penpot\.space\.modular\.lg/);
  assert.match(screen, /context\.penpot\.color\.info\.background/);
  assert.match(screen, /context\.penpot\.radius\.modular\.sm/);
  assert.doesNotMatch(screen, /Color\(0xffeaf4ff\)/);
  assert.match(namespaces, /class PenpotColorInfoTokens/);
  assert.match(namespaces, /final Color background;/);
  assert.match(namespaces, /final Duration fast;/);
  assert.match(extension, /extends ThemeExtension<PenpotTokens>/);
  assert.match(themes, /enum PenpotMode/);
  assert.match(themes, /ThemeData buildPenpotTheme/);
  assert.match(themes, /colorScheme: ThemeData\(\)\.colorScheme\.copyWith/);
  assert.match(themes, /primary: values\['color\.primary'\] as Color/);
  assert.ok(files.some((file) => file.path === "penpot_manifest.json"));
  for (const file of files.filter((file) => file.path.endsWith(".dart"))) {
    const path = new URL(`../${file.path.replace(/\//g, "_")}`, import.meta.url);
    writeFileSync(path, file.source);
    assert.doesNotThrow(() => execFileSync("dart", ["format", "-o", "none", path.pathname]));
  }
});

test("maps official Penpot shape token properties to semantic Flutter fields", () => {
  const result = extractSelection([{
    id: "bound-text", name: "Bound text", type: "text", x: 0, y: 0, width: 100, height: 24, visible: true,
    characters: "Info", fontFamily: "Inter", fontSize: "16", fills: [{ fillColor: "#eaf4ff", fillOpacity: 1 }],
    tokenBindings: { fill: "color.info.text", fontFamilies: "typography.family.body", fontSize: "typography.size.body" },
  }], [], [], {
    tokens: [
      { id: "text-color", name: "color.info.text", type: "color", value: "#eaf4ff", setId: "global" },
      { id: "font-family", name: "typography.family.body", type: "font-family", value: "Inter", setId: "global" },
      { id: "font-size", name: "typography.size.body", type: "font-size", value: 16, setId: "global" },
    ],
    sets: [{ id: "global", name: "Global", active: true, tokenIds: ["text-color", "font-family", "font-size"] }],
  });
  const dart = generateFlutterWidget(result.root, result.components, result.tokens);
  assert.match(dart, /color: context\.penpot\.color\.info\.text/);
  assert.match(dart, /fontFamily: context\.penpot\.typography\.family\.body/);
  assert.match(dart, /fontSize: context\.penpot\.typography\.size\.body/);
  assert.doesNotMatch(dart, /color: Color\(0xffeaf4ff\)/);
});

test("reuses a prebuilt token registry for repeated selection extraction", () => {
  const registry = buildTokenRegistry(
    [{ id: "primary", name: "color.primary", type: "color", value: "#6750a4", setId: "global" }],
    [{ id: "global", name: "Global", active: true, tokenIds: ["primary"] }],
  );
  const result = extractSelection([{
    id: "cached-token-shape", name: "Cached token shape", type: "rectangle", x: 0, y: 0, width: 10, height: 10, visible: true,
    fills: [{ fillColor: "#6750a4", fillOpacity: 1 }], tokenBindings: { fill: "color.primary" },
  }], [], [], { tokens: [], sets: [], registry });
  assert.equal(result.tokens, registry.tokens);
  assert.match(generateFlutterWidget(result.root, result.components, result.tokens), /context\.penpot\.color\.primary/);
});

test("reports token and theme generation mismatches", () => {
  const tokenDefinition = { id: "primary", sourceName: "color.primary", path: ["color", "primary"], type: "color", value: "#6750a4", references: [], dartClass: "AppColors", dartName: "primary" } as const;
  const diagnostics = validateFlutterThemeGeneration([tokenDefinition], [{ id: "light", name: "Light", group: "Mode", active: true, activeSetIds: [] }], []);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "TOKEN_GENERATION_MISMATCH"));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "TOKEN_THEME_GENERATION_MISMATCH"));
});

test("exports the full catalog rather than only tokens reachable from selected shapes", () => {
  const result = extractSelection([{
    ...buttonMain,
    fills: [{ fillColor: "#6750a4", fillOpacity: 1 }],
    tokenBindings: { fill: "color.primary" },
  }], [], [], {
    tokens: [
      { id: "primary", name: "color.primary", type: "color", value: "#6750a4", setId: "global" },
      { id: "unused", name: "color.unused", type: "color", value: "#ff0000", setId: "global" },
    ],
    sets: [{ id: "global", name: "Global", active: true, tokenIds: ["primary", "unused"] }],
  });
  const files = generateFlutterFiles(result.root, result.components, result.tokens, result.tokenSets);
  const namespaces = files.find((file) => file.path === "theme/penpot_token_namespaces.dart")!.source;
  assert.match(generateFlutterWidget(result.root, result.components, result.tokens), /context\.penpot\.color\.primary/);
  assert.match(namespaces, /final Color unused;/);
});

test("preserves set order, multidimensional themes, 200+ tokens, and alias resolution", () => {
  const bulk = Array.from({ length: 205 }, (_, index) => token(`bulk.token${index}`, "number", String(index), index));
  const global = token("color.background", "color", "#ffffff", 1000);
  const light = token("color.background", "color", "#eeeeee", 1001);
  const alias = token("color.surface", "color", "{color.background}", 1002, "#eeeeee");
  const dark = token("color.background", "color", "#000000", 1003);
  const sets = [
    tokenSet("global", "Global", true, [...bulk, global]),
    tokenSet("light", "Light", true, [light, alias]),
    tokenSet("dark", "Dark", false, [dark]),
  ];
  const catalog = {
    sets,
    themes: [
      tokenTheme("mode-light", "Mode", "Light", true, [sets[1]]),
      tokenTheme("mode-dark", "Mode", "Dark", false, [sets[2]]),
      tokenTheme("brand-a", "Brand", "A", true, [sets[0]]),
      tokenTheme("brand-b", "Brand", "B", false, [sets[0]]),
    ],
  } as unknown as TokenCatalog;
  const extracted = extractTokenCatalog(catalog);
  const registry = extractSelection([board], [], [], extracted.input);
  const resolved = resolveTokenSets(registry.tokens, registry.tokenSets, new Set(["global", "light"]));

  assert.equal(extracted.stats.tokens, 209);
  assert.equal(extracted.stats.sets, 3);
  assert.equal(extracted.stats.themes, 4);
  assert.deepEqual(registry.tokenSets.map((set) => set.id), ["global", "light", "dark"]);
  assert.equal(resolved.tokens.get("color.background")?.value, "#eeeeee");
  assert.equal(resolved.tokens.get("color.surface")?.value, "#eeeeee");
  assert.deepEqual(registry.tokenThemes.map((theme) => theme.group), ["Mode", "Mode", "Brand", "Brand"]);
});

test("indexes a 1,500-token catalog in bounded extraction slices without changing the snapshot", async () => {
  const catalog = syntheticTokenCatalog(1500) as unknown as TokenCatalog;
  const expected = extractTokenCatalog(catalog);
  let yields = 0;
  const timings = new Map<string, number>();
  const actual = await extractTokenCatalogIncrementally(catalog, {
    maxSliceMs: 0,
    yieldToHost: async () => { yields++; },
    reportTiming: (phase, milliseconds) => timings.set(phase, milliseconds),
  });

  assert.deepEqual(actual, expected);
  assert.ok(yields >= 1500);
  assert.ok((timings.get("largest-synchronous-slice") ?? Number.POSITIVE_INFINITY) >= 0);
});

test("a 5,000-token stress catalog remains linear and does not create duplicate tokens", async () => {
  const catalog = syntheticTokenCatalog(5000) as unknown as TokenCatalog;
  let processed = 0;
  const extracted = await extractTokenCatalogIncrementally(catalog, {
    maxSliceMs: 0,
    yieldToHost: async () => {},
    reportProgress: (progress) => { if (progress.phase === "tokens") processed = progress.processed; },
  });
  const registry = buildTokenRegistry(extracted.input.tokens, extracted.input.sets, extracted.input.themes);

  assert.equal(processed, 5000);
  assert.equal(extracted.stats.tokens, 5000);
  assert.equal(registry.tokens.length, 5000);
});

test("generates one theme-aware component source for light, dark, and partial theme overrides", () => {
  const result = extractSelection([{
    id: "theme-card", name: "Theme card", type: "rectangle", x: 0, y: 0, width: 40, height: 40, visible: true,
    fills: [{ fillColor: "#ffffff", fillOpacity: 1 }], tokenBindings: { fill: "color.primary" },
  }], [], [], {
    tokens: [
      { id: "space", name: "space.md", type: "spacing", value: 16, setId: "global" },
      { id: "light-primary", name: "color.primary", type: "color", value: "#ffffff", setId: "light" },
      { id: "dark-primary", name: "color.primary", type: "color", value: "#000000", setId: "dark" },
      { id: "light-body", name: "typography.bodyMedium", type: "typography", value: { fontSize: 14 }, setId: "light" },
      { id: "dark-body", name: "typography.bodyMedium", type: "typography", value: { fontSize: 16 }, setId: "dark" },
    ],
    sets: [
      { id: "global", name: "Global", active: true, tokenIds: ["space"] },
      { id: "light", name: "Light", tokenIds: ["light-primary", "light-body"] },
      { id: "dark", name: "Dark", tokenIds: ["dark-primary", "dark-body"] },
    ],
    themes: [
      { id: "light-theme", name: "Light", group: "Mode", active: true, activeSetIds: ["light"] },
      { id: "dark-theme", name: "Dark", group: "Mode", active: false, activeSetIds: ["dark"] },
      { id: "contrast-theme", name: "High Contrast", group: "Contrast", active: false, activeSetIds: ["dark"] },
    ],
  });
  const files = generateFlutterFiles(result.root, result.components, result.tokens, result.tokenSets, result.tokenThemes);
  const screen = files.find((file) => file.path === "screens/theme_card.dart")!.source;
  const themes = files.find((file) => file.path === "theme/penpot_themes.dart")!.source;
  assert.match(screen, /context\.penpot\.color\.primary/);
  assert.match(themes, /enum PenpotMode[\s\S]*light,[\s\S]*dark,/);
  assert.match(themes, /enum PenpotContrast/);
  assert.match(themes, /ThemeData\(\)\.colorScheme\.copyWith/);
  assert.match(themes, /ThemeData\(\)\.textTheme\.copyWith/);
  assert.match(themes, /'global'/);
  assert.match(themes, /PenpotMode\.dark => const \['dark'\]/);
});

test("diagnoses unresolved and ambiguous token theme configurations", () => {
  const registry = buildTokenRegistry(
    [
      { id: "base", name: "color.primary", type: "color", value: "#ffffff", setId: "base" },
      { id: "wrong-type", name: "color.primary", type: "spacing", value: 8, setId: "override" },
      { id: "alias", name: "color.surface", type: "color", value: "#ffffff", rawValue: "{color.missing}", references: ["color.missing"], setId: "base" },
      { id: "case", name: "COLOR.PRIMARY", type: "color", value: "#000000", setId: "base" },
    ],
    [
      { id: "base", name: "Base", active: true, tokenIds: ["base", "alias", "case"] },
      { id: "override", name: "Override", active: false, tokenIds: ["wrong-type"] },
    ],
    [
      { id: "collision-a", name: "Brand A", group: "Brand", active: false, activeSetIds: ["override"] },
      { id: "collision-b", name: "Brand-A", group: "Brand", active: false, activeSetIds: ["override"] },
      { id: "missing-base", name: "No Base", group: "Mode", active: false, activeSetIds: [] },
    ],
  );
  const codes = new Set(registry.diagnostics.map((diagnostic) => diagnostic.code));
  assert.ok(codes.has("THEME_NAME_COLLISION"));
  assert.ok(codes.has("THEME_INHERITANCE_UNRESOLVED"));
  assert.ok(codes.has("THEME_VALUE_TYPE_MISMATCH"));
  assert.ok(codes.has("THEME_TOKEN_MISSING"));
  assert.ok(codes.has("THEME_SEMANTIC_MAPPING_AMBIGUOUS"));
});

test("normalizes token names without erasing negative signs or zero padding", () => {
  assert.equal(dartMemberName("level-1", "token"), "level1");
  assert.equal(dartMemberName("level--1", "token"), "levelNegative1");
  assert.equal(dartMemberName("level--2", "token"), "levelNegative2");
  assert.equal(dartMemberName("050", "token"), "x050");
  assert.equal(dartMemberName("50", "token"), "x50");
  assert.equal(dartMemberName("golden-ratio", "token"), "goldenRatio");
  assert.equal(dartMemberName("major-third", "token"), "majorThird");
  assert.equal(dartMemberName("2xl", "token"), "x2xl");
  assert.equal(dartMemberName("Café", "token"), "cafe");
  assert.equal(dartMemberName("class", "token"), "classValue");

  const registry = buildTokenRegistry([
    { id: "positive", name: "color.level-1.border", type: "color", value: "#ffffff", setId: "scale" },
    { id: "negative", name: "color.level--1.border", type: "color", value: "#000000", setId: "scale" },
  ], [{ id: "scale", name: "Scale", active: true, tokenIds: ["positive", "negative"] }]);
  assert.equal(registry.diagnostics.filter((diagnostic) => diagnostic.code === "TOKEN_DART_NAME_COLLISION").length, 0);
});

test("parses CSS font-family stacks and resolves numeric token expressions", () => {
  const registry = buildTokenRegistry([
    { id: "family", name: "font-family.primary", type: "font-family", value: '"DM Sans", sans-serif', setId: "base", fontFamilyFallbacks: ["sans-serif"] },
    { id: "base", name: "dimension.base", type: "dimension", value: "8px", setId: "base" },
    { id: "scale", name: "dimension.scale", type: "number", value: 3, setId: "base" },
    { id: "modular", name: "modular.md", type: "dimension", value: "{dimension.base} * {dimension.scale}", rawValue: "{dimension.base} * {dimension.scale}", references: ["dimension.base", "dimension.scale"], setId: "base" },
  ], [{ id: "base", name: "Base", active: true, tokenIds: ["family", "base", "scale", "modular"] }]);
  const resolved = resolveTokenSets(registry.tokens, registry.sets, new Set(["base"]));
  assert.equal(registry.tokens.find((token) => token.id === "family")?.value, "DM Sans");
  assert.deepEqual(registry.tokens.find((token) => token.id === "family")?.fontFamilyFallbacks, ["sans-serif"]);
  assert.equal(resolved.tokens.get("modular.md")?.value, 24);
  assert.deepEqual(registry.tokens.find((token) => token.id === "modular")?.dependencies, ["dimension.base", "dimension.scale"]);
  assert.equal(registry.diagnostics.filter((diagnostic) => diagnostic.code === "TOKEN_ALIAS_UNRESOLVED").length, 0);
});

test("splits font-family arrays that contain CSS stacks", () => {
  const catalog = {
    sets: [tokenSet("fonts", "Fonts", true, [{
      id: "font-stack",
      name: "font-family.primary",
      type: "fontFamilies",
      value: ["DM Sans, sans-serif"],
      resolvedValue: ["DM Sans, sans-serif"],
    }])],
    themes: [],
  } as unknown as TokenCatalog;
  const extracted = extractTokenCatalog(catalog);
  const family = extracted.input.tokens?.find((token) => token.id === "font-stack");
  assert.equal(family?.value, "DM Sans");
  assert.deepEqual(family?.fontFamilyFallbacks, ["sans-serif"]);
});

test("keeps same token IDs distinct when they belong to different sets", () => {
  const registry = buildTokenRegistry([
    { id: "shared-id", name: "color.primary", type: "color", value: "#ffffff", setId: "light" },
    { id: "shared-id", name: "color.primary", type: "color", value: "#000000", setId: "dark" },
  ], [
    { id: "light", name: "Light", active: true, tokenIds: ["shared-id"] },
    { id: "dark", name: "Dark", active: true, tokenIds: ["shared-id"] },
  ]);
  assert.equal(registry.tokens.length, 2);
  assert.equal(registry.diagnostics.filter((diagnostic) => diagnostic.code === "TOKEN_IDENTITY_AMBIGUOUS").length, 0);
  assert.equal(resolveTokenSets(registry.tokens, registry.sets, new Set(["light"])).tokens.get("color.primary")?.value, "#ffffff");
  assert.equal(resolveTokenSets(registry.tokens, registry.sets, new Set(["dark"])).tokens.get("color.primary")?.value, "#000000");
});

test("diagnoses missing bindings, unsupported types, invalid values, and alias cycles", () => {
  const result = extractSelection([{
    id: "bad-token-shape", name: "Bad token shape", type: "rectangle", x: 0, y: 0, width: 10, height: 10, visible: true,
    fills: [{ fillColor: "#000000", fillOpacity: 1 }], tokenBindings: { fill: "missing.token" },
  }], [], [], { tokens: [
    { id: "cycle-a", name: "color.a", type: "color", value: "#000000", rawValue: "{color.b}", references: ["color.b"], setId: "set" },
    { id: "cycle-b", name: "color.b", type: "color", value: "#ffffff", rawValue: "{color.a}", references: ["color.a"], setId: "set" },
    { id: "bad-number", name: "spacing.bad", type: "spacing", value: "large", setId: "set" },
    { id: "unsupported", name: "asset.logo", type: "asset", value: "logo.svg", setId: "set" },
  ], sets: [{ id: "set", name: "Set", active: true, tokenIds: ["cycle-a", "cycle-b", "bad-number", "unsupported"] }] });
  const resolved = resolveTokenSets(result.tokens, result.tokenSets, new Set(["set"]));
  const codes = new Set([...result.diagnostics, ...resolved.diagnostics].map((diagnostic) => diagnostic.code));
  assert.ok(codes.has("TOKEN_BINDING_NOT_FOUND"));
  assert.ok(codes.has("TOKEN_REFERENCE_CYCLE"));
  assert.ok(codes.has("TOKEN_VALUE_INVALID"));
  assert.ok(codes.has("TOKEN_TYPE_UNSUPPORTED"));
});

function syntheticTokenCatalog(tokenCount: number) {
  const setCount = 15;
  const sets = Array.from({ length: setCount }, (_, setIndex) => {
    const start = Math.floor(tokenCount * setIndex / setCount);
    const end = Math.floor(tokenCount * (setIndex + 1) / setCount);
    return tokenSet(`set-${setIndex}`, `Set ${setIndex}`, setIndex === 0, Array.from({ length: end - start }, (_, offset) => {
      const index = start + offset;
      const name = index % 5 === 0 ? `color.token${index}` : index % 5 === 1 ? `spacing.token${index}` : `number.token${index}`;
      const value = index % 7 === 0 && index > 0 ? `{number.token${index - 1}} + 1` : String(index);
      return token(name, name.startsWith("color") ? "color" : name.startsWith("spacing") ? "spacing" : "number", value, index, index % 7 === 0 ? String(index) : value);
    }));
  });
  return {
    sets,
    themes: Array.from({ length: 10 }, (_, index) => tokenTheme(`theme-${index}`, `Group ${index % 2}`, `Theme ${index}`, index === 0, [sets[index % setCount]!])),
  };
}

function token(name: string, type: string, value: unknown, index: number, resolvedValue: unknown = value) {
  return { id: `token-${index}`, name, description: "", type, value, resolvedValue, resolvedValueString: String(resolvedValue), duplicate() {}, remove() {}, applyToShapes() {}, applyToSelected() {} };
}

function tokenSet(id: string, name: string, active: boolean, tokens: readonly unknown[]) {
  return { id, name, active, tokens, tokensByType: [], toggleActive() {}, getTokenById() {}, addToken() {}, duplicate() {}, remove() {} };
}

function tokenTheme(id: string, group: string, name: string, active: boolean, activeSets: readonly unknown[]) {
  return { id, externalId: undefined, group, name, active, activeSets, toggleActive() {}, addSet() {}, removeSet() {}, duplicate() {}, remove() {} };
}

function responsiveBoard(
  name: string,
  width: number,
  direction: "row" | "column" = "column",
  children: readonly PenpotSourceShape[] = [{ id: `${name}-content`, name: "Content", type: "rectangle", x: 0, y: 0, width: 100, height: 40, visible: true }],
) {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    type: "board",
    x: 0,
    y: 0,
    width,
    height: 800,
    visible: true,
    flex: { dir: direction, rowGap: 16, columnGap: 16 },
    children,
  } as const;
}

function responsiveDart(result: ReturnType<typeof extractSelection>): string {
  return generateFlutterWidget(result.root, result.components, result.tokens, result.responsiveScreen);
}

test("merges mobile and desktop Row-to-Column boards with LayoutBuilder breakpoints", () => {
  const result = extractSelection([
    responsiveBoard("Checkout / Mobile", 390, "column"),
    responsiveBoard("Checkout / Desktop", 1440, "row"),
  ]);
  assert.equal(result.responsiveScreen?.name, "Checkout");
  assert.deepEqual(result.responsiveScreen?.variants.map((variant) => [variant.minWidth, variant.maxWidth]), [[undefined, 600], [600, undefined]]);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "RESPONSIVE_BREAKPOINT_INFERRED"));
  const dart = responsiveDart(result);
  assert.match(dart, /LayoutBuilder\(/);
  assert.match(dart, /constraints\.maxWidth < 600/);
  assert.match(dart, /return Column\(/);
  assert.match(dart, /return Row\(/);
  assert.doesNotMatch(dart, /width: 390/);
  assert.doesNotMatch(dart, /width: 1440/);
  const responsiveDartPath = new URL("../responsive_checkout.dart", import.meta.url);
  writeFileSync(responsiveDartPath, dart);
  execFileSync("dart", ["format", responsiveDartPath.pathname]);
  assert.equal(dart, readFileSync(responsiveDartPath, "utf8"));
});

test("generates responsive grid column counts from breakpoint boards", () => {
  const gridBoard = (name: string, width: number, columns: number) => ({
    ...responsiveBoard(name, width),
    flex: undefined,
    grid: {
      dir: "row" as const,
      rows: [{ type: "flex" as const, value: 1 }],
      columns: Array.from({ length: columns }, () => ({ type: "flex" as const, value: 1 })),
      rowGap: 12,
      columnGap: 12,
    },
  });
  const result = extractSelection([gridBoard("Gallery / Mobile", 390, 2), gridBoard("Gallery / Desktop", 1440, 4)]);
  const dart = responsiveDart(result);
  assert.match(dart, /crossAxisCount: 2/);
  assert.match(dart, /crossAxisCount: 4/);
});

test("preserves elements hidden at a mobile breakpoint", () => {
  const desktopChildren = [
    { id: "content-desktop", name: "Content", type: "rectangle", x: 0, y: 0, width: 100, height: 40, visible: true },
    { id: "sidebar-desktop", name: "Sidebar", type: "rectangle", x: 0, y: 0, width: 200, height: 800, visible: true },
  ];
  const mobileChildren = desktopChildren.map((child) => ({ ...child, id: child.id.replace("desktop", "mobile"), visible: child.name !== "Sidebar" }));
  const result = extractSelection([
    responsiveBoard("Account / Mobile", 390, "column", mobileChildren),
    responsiveBoard("Account / Desktop", 1440, "row", desktopChildren),
  ]);
  const dart = responsiveDart(result);
  assert.match(dart, /\/\/ Sidebar\n\s*const SizedBox\.shrink\(\)/);
  assert.match(dart, /\/\/ Sidebar\n\s*SizedBox\(/);
});

test("preserves different selections of the same component variant across breakpoints", () => {
  const main = (id: string) => ({ ...buttonMain, id, name: id });
  const compact = main("compact");
  const expanded = main("expanded");
  const instance = (id: string, componentId: string) => ({ ...buttonInstance(id, "Continue"), componentId, componentLibraryId: "ui" });
  const result = extractSelection(
    [
      responsiveBoard("Actions / Mobile", 390, "column", [instance("mobile-button", "compact")]),
      responsiveBoard("Actions / Desktop", 1440, "row", [instance("desktop-button", "expanded")]),
    ],
    [
      { id: "compact", libraryId: "ui", name: "Compact", root: compact },
      { id: "expanded", libraryId: "ui", name: "Expanded", root: expanded },
    ],
    [{
      id: "button-responsive-family",
      libraryId: "ui",
      name: "Responsive Button",
      properties: ["Size"],
      defaultComponentId: "compact",
      members: [
        { id: "compact", libraryId: "ui", name: "Compact", root: compact, values: { Size: "Compact" } },
        { id: "expanded", libraryId: "ui", name: "Expanded", root: expanded, values: { Size: "Expanded" } },
      ],
    }],
  );
  const dart = responsiveDart(result);
  assert.match(dart, /ResponsiveButton\(\),/);
  assert.match(dart, /ResponsiveButton\(\n\s*size: ResponsiveButtonSize\.expanded,/);
});

test("maps Penpot min and max dimensions to ConstrainedBox", () => {
  const constrainedChild = {
    id: "constrained-content",
    name: "Constrained Content",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 320,
    height: 200,
    visible: true,
    layoutChild: { horizontalSizing: "fill" as const, verticalSizing: "auto" as const, minWidth: 240, maxWidth: 720, minHeight: 120, maxHeight: 480 },
  };
  const result = extractSelection([responsiveBoard("Constraints", 800, "column", [constrainedChild])]);
  const dart = generateFlutterWidget(result.root);
  assert.match(dart, /ConstrainedBox\(/);
  assert.match(dart, /BoxConstraints\(minWidth: 240, maxWidth: 720, minHeight: 120, maxHeight: 480\)/);
});

test("generates deterministic mobile, tablet, and desktop breakpoints", () => {
  const result = extractSelection([
    responsiveBoard("Catalog / Desktop", 1440, "row"),
    responsiveBoard("Catalog / Mobile", 390, "column"),
    responsiveBoard("Catalog / Tablet", 768, "column"),
  ]);
  assert.deepEqual(result.responsiveScreen?.variants.map((variant) => variant.sourceName), ["Catalog / Mobile", "Catalog / Tablet", "Catalog / Desktop"]);
  const dart = responsiveDart(result);
  assert.match(dart, /constraints\.maxWidth < 600/);
  assert.match(dart, /constraints\.maxWidth < 1024/);
});

test("keeps explicit responsive groups with unmatched nodes and reports divergence", () => {
  const mobile = { ...responsiveBoard("Phone", 390), responsive: { groupId: "checkout", groupName: "Checkout", maxWidth: 640 } };
  const desktop = {
    ...responsiveBoard("Wide", 1440, "row", [{ id: "navigation", name: "Navigation", type: "rectangle", x: 0, y: 0, width: 240, height: 800, visible: true }]),
    responsive: { groupId: "checkout", groupName: "Checkout", minWidth: 640 },
  };
  const result = extractSelection([mobile, desktop]);
  assert.equal(result.responsiveScreen?.name, "Checkout");
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "RESPONSIVE_LAYOUT_DIVERGENCE"));
});

test("does not merge unrelated breakpoint-like boards with similar names", () => {
  const result = extractSelection([
    responsiveBoard("Checkout / Mobile", 390),
    responsiveBoard("Checkout Settings / Desktop", 1440),
  ]);
  assert.equal(result.responsiveScreen, undefined);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "RESPONSIVE_GROUP_UNRESOLVED"));
  assert.equal(result.root.kind, "group");
});

test("retains absolute-positioned fallback inside responsive variants", () => {
  const overlay = (suffix: string) => [{ id: `badge-${suffix}`, name: "Badge", type: "rectangle", x: 20, y: 12, width: 40, height: 20, visible: true, layoutChild: { absolute: true } }];
  const result = extractSelection([
    { ...responsiveBoard("Profile / Mobile", 390, "column", overlay("mobile")), flex: undefined },
    { ...responsiveBoard("Profile / Desktop", 1440, "column", overlay("desktop")), flex: undefined },
  ]);
  const dart = responsiveDart(result);
  assert.match(dart, /Stack\(/);
  assert.match(dart, /Positioned\(/);
});

test("preserves nested component calls in responsive layouts", () => {
  const nestedInstance = (id: string) => ({ ...buttonInstance(id, "Continue"), componentLibraryId: "local" });
  const result = extractSelection(
    [
      responsiveBoard("Nested / Mobile", 390, "column", [nestedInstance("nested-mobile")]),
      responsiveBoard("Nested / Desktop", 1440, "row", [nestedInstance("nested-desktop")]),
    ],
    [{ id: "comp-button", libraryId: "local", name: "Primary Button", root: buttonMain }],
  );
  const dart = responsiveDart(result);
  assert.equal((dart.match(/PrimaryButton\(\)/g) ?? []).length, 2);
  assert.match(dart, /import '\.\.\/components\/primary_button\.dart';/);
});

test("deduplicates repeated typography styles into AppTextStyles", () => {
  const text = (id: string, name: string, x: number) => ({
    id,
    name,
    type: "text",
    x,
    y: 0,
    width: 120,
    height: 24,
    visible: true,
    characters: "Typography",
    fontFamily: "Inter",
    fontSize: "16",
    fontWeight: "400",
    lineHeight: "1.5",
    letterSpacing: "0.2",
    textDecoration: "underline" as const,
    align: "center" as const,
  });
  const result = extractSelection([text("type-1", "Body", 0), text("type-2", "Body copy", 130)]);
  assert.equal(result.typographyStyles.length, 1);
  assert.equal(result.typographyStyles[0].name, "inter16Regular");
  const files = generateFlutterFiles(result.root, result.components, result.tokens, result.tokenSets, result.tokenThemes, undefined, result.typographyStyles);
  assert.match(files.find((file) => file.path === "screens/selection.dart")!.source, /style: AppTextStyles\.inter16Regular/);
  const typographyDartPath = new URL("../app_typography.dart", import.meta.url);
  writeFileSync(typographyDartPath, files.find((file) => file.path === "app_typography.dart")!.source);
  execFileSync("dart", ["format", typographyDartPath.pathname]);
  assert.equal(files.find((file) => file.path === "app_typography.dart")!.source, readFileSync(typographyDartPath, "utf8"));
});

test("uses structural typography names instead of text content and sanitizes explicit names", () => {
  const text = (id: string, name: string, typographyName?: string) => ({
    id,
    name,
    type: "text",
    x: 0,
    y: 0,
    width: 120,
    height: 24,
    visible: true,
    characters: name,
    fontFamily: "Karla",
    fontSize: "15",
    fontWeight: "600",
    ...(typographyName === undefined ? {} : { typographyName }),
  });
  const structural = extractSelection([text("paris", "Paris"), text("village", "Village")]);
  assert.equal(structural.typographyStyles[0].name, "karla15SemiBold");
  assert.doesNotMatch(generateFlutterTypography(structural.typographyStyles), /AppTextStyles\\.paris/);

  const numeric = extractSelection([text("numeric-1", "One", "1.1.2"), text("numeric-2", "Two", "1.1.2")]);
  assert.equal(numeric.typographyStyles[0].name, "x112");
  assert.doesNotMatch(generateFlutterTypography(numeric.typographyStyles), /static const 112/);
});

test("tracks custom fonts, fallback families, and unavailable font assets", () => {
  const result = extractSelection([{
    id: "font-text",
    name: "Custom text",
    type: "text",
    x: 0,
    y: 0,
    width: 200,
    height: 30,
    visible: true,
    characters: "Custom",
    fontFamily: "Acme Sans, Courier",
    fontSize: "16",
    fontWeight: "450",
  }], [], [], {}, {
    fonts: [{ id: "acme", family: "Acme Sans", variants: [{ weight: 400, style: "normal" }] }],
  });
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "FONT_EXTERNAL_REQUIRED"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "FONT_WEIGHT_APPROXIMATED"));
  assert.deepEqual(result.fonts[0].fallbackFamilies, ["Courier", "sans-serif"]);
  assert.equal(result.fonts[0].available, false);
  assert.match(generateFlutterWidget(result.root), /fontFamilyFallback: const \['Courier', 'sans-serif'\]/);
});

test("converts absolute and percentage line heights and preserves alignment, transform, and overflow", () => {
  const result = extractSelection([{
    id: "semantic-text",
    name: "Semantic text",
    type: "text",
    x: 0,
    y: 0,
    width: 200,
    height: 48,
    visible: true,
    characters: "hello world",
    fontFamily: "sans-serif",
    fontSize: "16",
    fontWeight: "700",
    lineHeight: "24px",
    letterSpacing: "1.25",
    textTransform: "uppercase",
    textDecoration: "line-through",
    align: "right",
    verticalAlign: "center",
    maxLines: 1,
    overflow: "ellipsis",
    softWrap: false,
  }]);
  const dart = generateFlutterWidget(result.root);
  assert.match(dart, /height: 1\.5/);
  assert.match(dart, /textAlign: TextAlign\.right/);
  assert.match(dart, /'HELLO WORLD',/);
  assert.match(dart, /maxLines: 1/);
  assert.match(dart, /overflow: TextOverflow\.ellipsis/);
  assert.match(dart, /softWrap: false/);
  assert.match(dart, /Alignment\.centerRight/);
  assert.match(dart, /TextDecoration\.lineThrough/);
  const semanticDartPath = new URL("../semantic_text.dart", import.meta.url);
  writeFileSync(semanticDartPath, dart);
  execFileSync("dart", ["format", semanticDartPath.pathname]);
  assert.equal(dart, readFileSync(semanticDartPath, "utf8"));
});

test("preserves mixed inline styles and nested text spans", () => {
  const result = extractSelection([{
    id: "mixed-text",
    name: "Mixed text",
    type: "text",
    x: 0,
    y: 0,
    width: 240,
    height: 40,
    visible: true,
    characters: "Hello world",
    fontFamily: "Inter",
    fontSize: "16",
    runs: [{
      characters: "Hello",
      fontFamily: "Inter",
      fontSize: "16",
      fontWeight: "700",
      children: [{ characters: "!", fontFamily: "Inter", fontSize: "16", fontWeight: "700" }],
    }, { characters: " world", fontFamily: "Inter", fontSize: "16", fontWeight: "400" }],
  }]);
  const dart = generateFlutterWidget(result.root);
  assert.match(dart, /RichText\(/);
  assert.match(dart, /children: \[/);
  assert.match(dart, /text: 'Hello'/);
  assert.match(dart, /text: '!'/);
  assert.match(dart, /text: ' world'/);
});

test("emits font assets in the Flutter pubspec snippet when supplied by an adapter", () => {
  const result = extractSelection([{
    id: "font-text-asset",
    name: "Asset font",
    type: "text",
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    visible: true,
    characters: "Asset",
    fontFamily: "Brand",
    fontSize: "14",
  }], [], [], {}, {
    fonts: [{ id: "brand", family: "Brand", variants: [{ weight: 700, style: "italic", assetPath: "assets/fonts/Brand-BoldItalic.ttf" }] }],
  });
  assert.match(generatePubspecSnippet([], result.fonts), /family: Brand/);
  assert.match(generatePubspecSnippet([], result.fonts), /asset: assets\/fonts\/Brand-BoldItalic\.ttf/);
  assert.match(generatePubspecSnippet([], result.fonts), /style: italic/);
});
