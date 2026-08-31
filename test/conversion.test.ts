import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import test from "node:test";

import { extractSelection } from "../src/core/extractor.js";
import { generateFlutterWidget } from "../src/core/flutter-generator.js";

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
  assert.match(dart, /height: 1\.1666666666666667,/);
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
      id: "vector-1",
      name: "Logo path",
      type: "path",
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
  assert.match(dart, /EdgeInsets\.only\(top: 8, right: 20, bottom: 12, left: 24\)/);
  assert.match(dart, /Row\(\n\s*textDirection: TextDirection\.rtl,/);
  assert.match(dart, /mainAxisAlignment: MainAxisAlignment\.spaceBetween,/);
  assert.match(dart, /crossAxisAlignment: CrossAxisAlignment\.center,/);
  assert.match(dart, /Expanded\(/);
  assert.match(dart, /height: double\.infinity,/);
  assert.match(dart, /Positioned\(\n\s*left: 320,/);

  const flexDartPath = new URL("../flex_generated_widget.dart", import.meta.url);
  writeFileSync(flexDartPath, dart);
  assert.doesNotThrow(() => execFileSync("dart", ["format", "-o", "none", flexDartPath.pathname]));
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
  assert.match(dart, /SizedBox\(height: 10\)/);
  assert.match(dart, /width: double\.infinity,/);
  assert.doesNotMatch(dart, /Stack\(/);
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
