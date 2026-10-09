// SPDX-License-Identifier: Apache-2.0
//
// Byte-compares the corpus's three emitters against one another.
//
// Each emitter separately checks its own output against the committed bytes,
// so this file exists for the question none of those runs asks: **do they all
// agree with each other**, vector by vector, before any is compared with
// anything. The distinction is not academic. A rule the text leaves open is one
// every emitter may still satisfy — each in its own way — against a corpus that
// only ever pinned the choice one of them happened to make. Emitters agreeing
// is a claim about the TEXT; one emitter agreeing with the bytes it once wrote
// is a claim about nothing.
//
// Agreement here is UNANIMITY, never a majority. Two of the three share a
// runtime, so a two-against-one split is not evidence about which is right —
// it is more likely evidence about what that runtime supplies for free.
//
// It also asserts that between them they cover every round-trip vector the
// manifest enumerates. An emitter that quietly stopped producing a family
// would otherwise report perfect agreement on the families it kept.
//
//   node compare-emitters.mjs
//
// Zero dependencies; Node's own child_process and fs only. Neither emitter is
// imported — each is run as its own process and asked for a dump — so nothing
// here can perturb what either of them emits.
//
// ── When this goes red ───────────────────────────────────────────────────
//
// **Read the text, not the emitters.** A divergence is FIRST a question about
// whether PROGRAM_WIRE.md determines the bytes at all. If it does, one emitter
// has a defect and the text names which. If it does not — if the text left the
// ordering, the escaping, the presence of a member or a derived value open, and
// each emitter closed it a different way — then the defect is in the TEXT, and
// the fix is the five-artefact change-set CONTRIBUTING.md describes, starting
// with the sentence that failed to decide. Settling it by editing whichever
// emitter looks wrong converts a specification defect into a convention two
// files share, which is the state this arrangement exists to detect.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Three emitters, and the third is in another LANGUAGE rather than merely
// another file. Two readings in one runtime cannot test a rule that runtime
// supplies for free — §2.3's member ordering is Ordinal, and JavaScript's `<`
// on strings already compares UTF-16 code units, so neither emitter above has
// to implement the rule on purpose. Python orders strings by code point, which
// disagrees with Ordinal across exactly one boundary (a supplementary
// character's leading UTF-16 unit is a high surrogate, so it sorts below
// U+E000–U+FFFF Ordinally and above them by code point). Getting the corpus
// right there is therefore deliberate in the third emitter and inherited in
// the first two, which is what makes agreement between all three mean the rule
// was understood rather than merely obeyed.
const EMITTERS = [
  { label: "resident", script: "emit.mjs", interpreter: process.execPath },
  { label: "independent", script: "emit-independent.mjs", interpreter: process.execPath },
  // Resolved from the environment so a machine whose interpreter is not on
  // PATH under this name can name it, rather than this check silently becoming
  // a two-way comparison again.
  { label: "ordinal", script: "emit-ordinal.py", interpreter: process.env.PYTHON ?? "python" },
];

const dump = ({ label, script, interpreter }) => {
  let text;
  try {
    text = execFileSync(interpreter, [join(here, script), "--emit-json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    console.error(`the ${label} emitter (${script}) could not produce a dump:`);
    console.error(`  ${err.message}`);
    if (interpreter !== process.execPath)
      console.error(
        `  it runs under '${interpreter}'; set PYTHON to name another. This leg is NOT skipped when ` +
          "its interpreter is missing — a three-way agreement that quietly became a two-way one " +
          "would report the same green while testing strictly less.",
      );
    process.exit(1);
  }
  try {
    return JSON.parse(text);
  } catch {
    console.error(`the ${label} emitter (${script}) produced a dump that is not JSON`);
    process.exit(1);
  }
};

const dumps = EMITTERS.map(dump);
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

// The manifest is the authoritative enumeration, so the comparison is driven
// by it rather than by whatever either emitter happened to produce — which is
// what lets a MISSING document be a finding rather than an absence nobody
// looks for.
const roundTrips = manifest.vectors.filter((v) => v.kind === "round-trip");
const byFile = new Map(manifest.vectors.map((v) => [v.file, v]));

const failures = [];
const report = (file, lines) => {
  const entry = byFile.get(file);
  const id = entry?.id ?? file;
  const family = entry?.family ?? "(no family — this file is enumerated by no vector)";
  failures.push(id);
  console.error(`FAIL ${id}  (family ${family}, file ${file})`);
  for (const line of lines) console.error(`  ${line}`);
};

let agreed = 0;

const width = Math.max(...EMITTERS.map((e) => e.label.length));

for (const vector of roundTrips) {
  const produced = dumps.map((d) => d[vector.file]);

  // A document one emitter does not produce at all is reported before the
  // comparison, because "undefined" would otherwise compare unequal and be
  // read as a disagreement about bytes rather than an absence.
  if (produced.some((p) => p === undefined)) {
    report(
      vector.file,
      EMITTERS.map((e, i) =>
        produced[i] === undefined
          ? `${e.label.padEnd(width)} : not emitted`
          : `${e.label.padEnd(width)} : ${produced[i]}`,
      ).concat("an emitter does not produce a document the manifest enumerates as a round-trip vector"),
    );
    continue;
  }

  // Agreement is unanimity, not a majority: two emitters sharing a runtime can
  // share its accidents, so "two against one" is not evidence about which is
  // right. Every disagreement is reported with EVERY emitter's bytes, so the
  // reader can see which way the split runs before reaching for the text.
  if (produced.every((p) => p === produced[0])) {
    agreed += 1;
    console.log(`ok   ${vector.id}`);
  } else {
    report(
      vector.file,
      EMITTERS.map((e, i) => `${e.label.padEnd(width)} : ${produced[i]}`),
    );
  }
}

// Anything an emitter produces that the manifest does not enumerate is the
// mirror failure: a document nobody is required to handle, invisible to every
// implementation certifying against the corpus.
for (const [label, produced] of EMITTERS.map((e, i) => [e.label, dumps[i]])) {
  for (const file of Object.keys(produced)) {
    if (!byFile.has(file))
      report(file, [`the ${label} emitter produces it, and the manifest enumerates no vector for it`]);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} divergence(s) between the ${EMITTERS.length} emitters.`);
  console.error("");
  console.error("READ THE TEXT, NOT THE EMITTERS. A divergence here is first a question about");
  console.error("whether PROGRAM_WIRE.md determines these bytes at all. Where it does not, the");
  console.error("defect is in the specification and the fix is the five-artefact change-set in");
  console.error("CONTRIBUTING.md — beginning with the sentence that failed to decide. Editing");
  console.error("whichever emitter looks wrong turns a specification defect into a convention.");
  process.exit(1);
}

if (agreed === 0) {
  console.error("no documents were compared");
  process.exit(1);
}

const runtimes = new Set(EMITTERS.map((e) => e.interpreter)).size;
console.log(
  `\n${agreed} documents emitted identically by ${EMITTERS.length} independently written emitters ` +
    `(${EMITTERS.map((e) => e.label).join(", ")}) across ${runtimes} runtimes.`,
);
