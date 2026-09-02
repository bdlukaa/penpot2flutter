import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("installs only the generator-owned handoff tree and preserves developer files", () => {
  const directory = mkdtempSync(join(tmpdir(), "penpot-handoff-"));
  const project = join(directory, "app");
  const bundlePath = join(directory, "penpot_handoff.json");
  try {
    mkdirSync(join(project, "lib/app"), { recursive: true });
    writeFileSync(join(project, "lib/app/main.dart"), "developer-owned\n");
    writeFileSync(bundlePath, JSON.stringify({
      formatVersion: 1,
      generatorVersion: "test",
      files: [{ path: "lib/generated/penpot/penpot.dart", source: "export 'components/card.dart';\n", tier: "design-system" }],
      assets: [{ filename: "assets/penpot/images/card.png", type: "png", content: "AQID", encoding: "base64" }],
      integration: { pubspecSnippet: "flutter:\n  assets:\n    - assets/penpot/images/card.png\n", fontRequirements: [] },
    }));

    const output = execFileSync(process.execPath, [join(process.cwd(), "bin/install-handoff.mjs"), bundlePath, project], { encoding: "utf8" });
    assert.match(output, /Installed 1 generated files and 1 assets/);
    assert.equal(readFileSync(join(project, "lib/generated/penpot/penpot.dart"), "utf8"), "export 'components/card.dart';\n");
    assert.deepEqual([...readFileSync(join(project, "assets/penpot/images/card.png"))], [1, 2, 3]);
    assert.equal(readFileSync(join(project, "lib/app/main.dart"), "utf8"), "developer-owned\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects handoff paths outside generator-owned directories", () => {
  const directory = mkdtempSync(join(tmpdir(), "penpot-handoff-invalid-"));
  const bundlePath = join(directory, "penpot_handoff.json");
  try {
    writeFileSync(bundlePath, JSON.stringify({
      formatVersion: 1,
      files: [{ path: "lib/app/main.dart", source: "bad\n" }],
      assets: [],
      integration: { pubspecSnippet: "", fontRequirements: [] },
    }));
    assert.throws(
      () => execFileSync(process.execPath, [join(process.cwd(), "bin/install-handoff.mjs"), bundlePath, join(directory, "app")], { stdio: "pipe" }),
      /Refusing path outside lib\/generated\/penpot/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
