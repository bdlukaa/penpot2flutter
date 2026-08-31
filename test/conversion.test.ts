import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";

import { extractSelection } from "../src/core/extractor.js";
import { generateFlutterWidget, generatePubspecSnippet } from "../src/core/flutter-generator.js";

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
  assert.match(dart, /height: 230\.69,/);
  assert.doesNotMatch(dart, /230\.68965517218118/);
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
