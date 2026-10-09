// SPDX-License-Identifier: Apache-2.0
//
// Structural invariants of the corpus manifest.
//
// The resident emitter (emit.mjs) answers "do the bytes still come out the way
// the specification says". This answers the different question the emitter
// structurally cannot: "does the manifest still describe the tree it sits in".
//
// The distinction matters because the manifest is the enumeration a conformance
// claim is made against. A vector present in the tree but missing from the
// manifest is not a harmless extra file — it is a document nobody is required
// to handle, and every implementation still reports full conformance. That
// failure is invisible from inside the emitter, which only ever looks at
// vectors the manifest already lists.
//
//   node check-manifest.mjs
//
// Exits non-zero, naming every violation found, rather than stopping at the
// first: a corpus with three problems should take one run to discover, not
// three.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const KINDS = new Set(["round-trip", "reject"]);
const SAFETY = new Set(["safe", "unsafe", "unknown"]);

// The top-level document a vector IS, which is not always its family: a family
// is an organising grouping, and `cross-layer` deliberately carries a handler
// document to pin the rule that a call action may not declare a result target.
// A harness dispatches on this, so a vector that got it wrong would be fed to
// the wrong reader and could pass by refusing for an unrelated reason.
const DOCUMENTS = new Set([
  "handler",
  "server-effect",
  "client-effect",
  "invocation",
  "outcome",
  "logic-tree-ref",
]);

// Appendix A. A reject vector must name a class from this closed list — a
// free-text class would let a corpus and a reader agree on a string neither
// specification mentions.
// §7.5. Closed, and paired with the grade each token forces, because the
// grade is what joins a vector's reasons to its declared classification: a
// manifest whose reasons and whose value disagree describes two handlers.
const DEFECTS = {
  "opaque-host-call": "unsafe",
  "outbound-notification": "unsafe",
  "staged-query": "unsafe",
  "relative-addressing": "unknown",
  "non-literal-write": "unknown",
  "undecidable-action": "unknown",
  "unencodable-op": "unknown",
};

// The six a DOCUMENT can exhibit, and therefore the six this corpus can be
// held to. One of them, `staged-query`, a document exhibits only under the
// host's query posture its vector declares (§7.4, `queryEvaluator`) — still a
// document and a declaration, so still a vector. §7.5 says why the seventh is
// not among them: `unencodable-op` names a
// defect in a reader's own rendering of a referenced position, and an op that
// does not decode is refused as `malformed-referenced-value` before any
// classification runs — so no conformant document reaches it, and a corpus
// demanding a vector for it would be demanding one that cannot exist. It is
// certified by a host's own suite instead, which is the only place it lives.
const DOCUMENT_REACHABLE = new Set([
  "opaque-host-call",
  "outbound-notification",
  "staged-query",
  "relative-addressing",
  "non-literal-write",
  "undecidable-action",
]);

// §10.7 — the subjects a vector may name besides the referenced vocabulary,
// which is what a vector naming NO subject is in. Closed, for the reason the
// refusal classes are: a subject a host has never heard of would be a set of
// vectors every host skips while reporting full conformance.
const SUBJECTS = new Set(["toy"]);

// The tokens a TOY document can exhibit, and therefore the ones the toy
// families can be held to discriminating. Two fewer than §7.5's seven, and both
// absences are properties of the toy rather than gaps (§10.7): `unencodable-op`
// for the reason it is absent at every subject, and `relative-addressing`
// because the toy's one op always names its target — a `Relabel` whose
// `target` is not an identifier is refused before anything is classified. The
// second absence is ASSERTED below rather than merely permitted, so a toy
// vector that ever carried the token would mean the toy or the text had moved.
const TOY_DOCUMENT_REACHABLE = new Set([
  "opaque-host-call",
  "outbound-notification",
  "staged-query",
  "non-literal-write",
  "undecidable-action",
]);
const TOY_UNREACHABLE = ["relative-addressing", "unencodable-op"];

// The families whose round-trip vectors carry §7.4/§7.5's derived values: the
// handler family at each subject.
const HANDLER_FAMILIES = new Set(["handler", "toy-handler"]);

// §7.4 — the host query postures a handler vector may declare its derived
// values under. Closed, on the subjects' argument: a posture a reader has never
// heard of would be read as the fold, and a staged read certified as a pure one.
const QUERY_POSTURES = new Set(["reaching", "pure-read"]);

const CLASSES = new Set([
  "null-member",
  "undeclared-member",
  "missing-member",
  "unknown-stage-kind",
  "unknown-effect-arm",
  "empty-name",
  "name-too-long",
  "host-reserved-landing-slot",
  "empty-idempotency-key",
  "idempotency-key-too-long",
  "impossible-outcome",
  "endpoint-echoed",
  "unknown-slot",
  "tree-declared-result-target",
  "malformed-referenced-value",
  "malformed-content-address",
  // `content-address-mismatch` is in Appendix A and deliberately NOT here: the
  // document it addresses is not in this corpus, so no reject vector can name
  // it and admitting it would advertise a class this corpus cannot certify.
  // Same shape as `unencodable-op` above.
]);

// §7.4's ranking, needed here to recompute a vector's verdict from its own
// declared reasons.
const RANK = { safe: 0, unknown: 1, unsafe: 2 };

const failures = [];
const fail = (m) => failures.push(m);

/**
 * How many stages a handler document declares, or `null` where the file is not
 * a readable handler. Used to bound a reason's ordinal: a reason addressing a
 * stage the document does not have is a locator pointing at nothing, and it is
 * exactly what a hand-edited manifest produces after a stage is removed.
 */
const countStages = (path) => {
  try {
    const document = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(document.stages) ? document.stages.length : null;
  } catch {
    return null;
  }
};

/**
 * The ordinals of a handler document's read stages (`RunQuery` effects), or
 * `null` where the file is not a readable handler. A vector declaring the
 * `reaching` posture must name exactly these stages as `staged-query`: the
 * join between the posture a vector declares and the reasons it declares,
 * which no emitter can make for a reader because each takes both from its own
 * model.
 */
const readStages = (path) => {
  try {
    const document = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(document.stages)) return null;
    return document.stages.flatMap((s, k) =>
      s.$type === "Effect" && s.effect && s.effect.$type === "RunQuery" ? [k] : [],
    );
  } catch {
    return null;
  }
};

const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const families = manifest.families ?? [];
const declared = new Set(families);

// The corpus carries two kinds of family and they are enumerated separately:
// `families` / `vectors` are WIRE DOCUMENTS, `scenarioFamilies` / `scenarios`
// are BEHAVIOURAL SCENARIOS (§10.3). The separation is not cosmetic — a
// scenario is a directory of three files with a step trace, and a codec harness
// handed one would try to round-trip it. Three things keep the two apart, and
// this file enforces all three: a disjoint family list, a disjoint top-level
// array, and a `kind` neither side can spell.
const scenarioFamilies = manifest.scenarioFamilies ?? [];
const scenarioDeclared = new Set(scenarioFamilies);
const SCENARIO_KIND = "step-trace";

for (const family of scenarioFamilies)
  if (declared.has(family)) fail(`family "${family}" is declared as both a document family and a scenario family`);

// §10.7 — the documents carrying no referenced vocabulary at all, which a
// host of EITHER subject certifies as they are rather than the corpus carrying
// a toy copy of each. A declared list, because a host computes its run count
// from it: a document missing from it is one a toy-subject host never runs,
// and one wrongly on it is one a toy-subject host runs without the vocabulary
// to read it.
const vocabularyFree = manifest.vocabularyFreeDocuments;
if (!Array.isArray(vocabularyFree) || vocabularyFree.length === 0)
  fail("the manifest declares no vocabularyFreeDocuments list (§10.7)");
const vocabularyFreeSet = new Set(Array.isArray(vocabularyFree) ? vocabularyFree : []);
for (const document of vocabularyFreeSet)
  if (!DOCUMENTS.has(document)) fail(`vocabularyFreeDocuments names ${JSON.stringify(document)}, which is not a document`);

// A family is at ONE subject: every vector in it names the same subject, or
// none. A family mixing the two would be a grouping no harness could select
// by, and a vector filed with the wrong subject is one the wrong host runs.
const familySubject = new Map();

const enumerated = new Set();
for (const v of manifest.vectors ?? []) {
  const id = v.id ?? "(anonymous vector)";

  if (v.subject !== undefined && !SUBJECTS.has(v.subject))
    fail(`${id}: subject ${JSON.stringify(v.subject)} is not one §10.7 declares`);
  const subject = v.subject ?? "(referenced)";
  if (!familySubject.has(v.family)) familySubject.set(v.family, subject);
  else if (familySubject.get(v.family) !== subject)
    fail(`${id}: family "${v.family}" mixes subjects — this vector is at ${subject}, an earlier one at ${familySubject.get(v.family)}`);
  if (typeof v.family === "string" && v.family.startsWith("toy-") && v.subject !== "toy")
    fail(`${id}: sits in a toy family but declares no subject "toy"`);
  if (v.subject !== undefined && vocabularyFreeSet.has(v.document))
    fail(
      `${id}: a ${v.document} document is vocabulary-free and certified at every subject as it is — a ${v.subject} copy duplicates it (§10.7)`,
    );

  if (v.kind === SCENARIO_KIND)
    fail(`${id}: a vector may not be a ${SCENARIO_KIND} — scenarios are enumerated separately (§10.3)`);
  if (!KINDS.has(v.kind)) fail(`${id}: unknown kind ${JSON.stringify(v.kind)}`);
  if (!DOCUMENTS.has(v.document)) fail(`${id}: unknown document ${JSON.stringify(v.document)}`);
  if (!declared.has(v.family)) fail(`${id}: family ${JSON.stringify(v.family)} is not declared`);
  if (!v.description) fail(`${id}: no description`);

  if (!v.file) {
    fail(`${id}: no file`);
    continue;
  }
  if (!v.file.startsWith(v.family + "/")) fail(`${id}: file "${v.file}" does not sit in family "${v.family}"`);
  if (enumerated.has(v.file)) fail(`${id}: file "${v.file}" is enumerated by more than one vector`);
  enumerated.add(v.file);

  let bytes;
  try {
    bytes = readFileSync(join(here, v.file));
  } catch {
    fail(`${id}: file "${v.file}" is enumerated but not present`);
    continue;
  }

  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== v.sha256) fail(`${id}: sha256 is ${v.sha256} but the file hashes to ${got}`);

  // A fixture's bytes ARE the document — a trailing newline would be part of it.
  if (bytes.length && bytes[bytes.length - 1] === 0x0a)
    fail(`${id}: file ends with a newline, which would be part of the document`);
  if (bytes.includes(0x0d)) fail(`${id}: file contains a CR — the checkout is not honouring the LF pin`);

  // A reject vector states what a reader must refuse it FOR. Without that, a
  // harness passes it by refusing for any reason at all, including one the
  // specification does not sanction.
  if (v.kind === "reject" && !v.reject) fail(`${id}: a reject vector must name its refusal class`);
  if (v.kind !== "reject" && v.reject) fail(`${id}: names a refusal class but is kind ${JSON.stringify(v.kind)}`);
  if (v.reject && !CLASSES.has(v.reject)) fail(`${id}: refusal class ${JSON.stringify(v.reject)} is not in Appendix A`);

  // §7.4 — every handler ROUND-TRIP vector carries the derived classification a
  // harness must reproduce. Required on that family and forbidden elsewhere, so
  // "this vector has no expectation" and "this family has none" stay distinct.
  const wantsSafety = HANDLER_FAMILIES.has(v.family) && v.kind === "round-trip";
  if (wantsSafety && !SAFETY.has(v.replaySafety))
    fail(`${id}: a handler round-trip vector must declare a replaySafety from ${[...SAFETY].join(" / ")}`);
  if (!wantsSafety && v.replaySafety !== undefined)
    fail(`${id}: declares replaySafety, which only a handler round-trip vector carries`);

  // §7.5 — the reasons beside the value, on the same terms: required on that
  // family and forbidden elsewhere. Checked for SHAPE and for AGREEMENT with
  // the declared classification, which is the join the emitters cannot make
  // for a reader — they recompute both from a model, where this asks whether
  // the two things the manifest states about one vector describe one handler.
  if (wantsSafety && !Array.isArray(v.replayReasons)) {
    fail(`${id}: a handler round-trip vector must declare a replayReasons array (§7.5)`);
  } else if (!wantsSafety && v.replayReasons !== undefined) {
    fail(`${id}: declares replayReasons, which only a handler round-trip vector carries`);
  } else if (wantsSafety) {
    const stages = countStages(join(here, v.file));
    let verdict = "safe";

    for (const reason of v.replayReasons) {
      if (!Number.isInteger(reason.stage) || reason.stage < 0)
        fail(`${id}: a reason's stage is an ordinal, not ${JSON.stringify(reason.stage)}`);
      else if (stages !== null && reason.stage >= stages)
        fail(`${id}: a reason addresses stage ${reason.stage} of a handler declaring ${stages}`);

      if (!(reason.defect in DEFECTS)) fail(`${id}: defect ${JSON.stringify(reason.defect)} is not in the §7.5 vocabulary`);
      else verdict = RANK[DEFECTS[reason.defect]] > RANK[verdict] ? DEFECTS[reason.defect] : verdict;

      for (const member of Object.keys(reason))
        if (member !== "stage" && member !== "defect") fail(`${id}: a reason declares stage and defect, not ${member}`);
    }

    if (SAFETY.has(v.replaySafety) && verdict !== v.replaySafety)
      fail(`${id}: its reasons carry the verdict "${verdict}" but it declares replaySafety "${v.replaySafety}"`);

    const seen = new Set(v.replayReasons.map((r) => `${r.stage}:${r.defect}`));
    if (seen.size !== v.replayReasons.length) fail(`${id}: the same reason is declared twice for one stage`);

    // §7.4 — the host posture the values are read under. Absent is the
    // in-memory fold. `staged-query` is the posture's token and no other's:
    // declared exactly at the document's read stages under `reaching`, and
    // nowhere otherwise.
    if (v.queryEvaluator !== undefined && !QUERY_POSTURES.has(v.queryEvaluator))
      fail(`${id}: queryEvaluator ${JSON.stringify(v.queryEvaluator)} is not a posture §7.4 names`);
    const staged = v.replayReasons
      .filter((r) => r.defect === "staged-query")
      .map((r) => r.stage)
      .sort((a, b) => a - b);
    const reads = readStages(join(here, v.file));
    const expected = v.queryEvaluator === "reaching" ? reads : [];
    if (expected !== null && staged.join(",") !== expected.join(","))
      fail(
        `${id}: declares staged-query at [${staged}] under queryEvaluator ${v.queryEvaluator ?? "(absent)"}, ` +
          `but its read stages under that posture are [${expected}]`,
      );
  }
  if (!wantsSafety && v.queryEvaluator !== undefined)
    fail(`${id}: declares queryEvaluator, which only a handler round-trip vector carries`);
}

// --- the scenario enumeration ---------------------------------------------
// Only the INDEX questions live here — is every scenario named, is every named
// scenario there, is anything in the tree unaccounted for. Whether a recorded
// trace has the shape §10.3 gives it is check-scenarios.mjs's question, and the
// two are kept apart for the same reason the emitter and this file are.
const scenarioDirs = new Set();

for (const s of manifest.scenarios ?? []) {
  const id = s.id ?? "(anonymous scenario)";

  if (s.kind !== SCENARIO_KIND) fail(`${id}: a scenario's kind is "${SCENARIO_KIND}", not ${JSON.stringify(s.kind)}`);
  if (!scenarioDeclared.has(s.family)) fail(`${id}: scenario family ${JSON.stringify(s.family)} is not declared`);
  if (!s.description) fail(`${id}: no description`);
  if (!s.dir) {
    fail(`${id}: no dir`);
    continue;
  }
  if (scenarioDirs.has(s.dir)) fail(`${id}: dir "${s.dir}" is enumerated by more than one scenario`);
  scenarioDirs.add(s.dir);

  for (const member of ["tree", "events", "expectation"]) {
    const file = (s.files ?? {})[member];
    if (!file) {
      fail(`${id}: no files.${member}`);
      continue;
    }
    // One namespace of enumerated files across BOTH arrays, so a path can never
    // be claimed as a wire vector and as part of a scenario at once.
    if (enumerated.has(file)) fail(`${id}: file "${file}" is enumerated more than once`);
    enumerated.add(file);
    try {
      statSync(join(here, file));
    } catch {
      fail(`${id}: file "${file}" is enumerated but not present`);
    }
  }
}

for (const family of scenarioFamilies) {
  let entries;
  try {
    entries = readdirSync(join(here, family), { withFileTypes: true });
  } catch {
    fail(`scenario family "${family}" is declared but has no directory`);
    continue;
  }
  for (const entry of entries) {
    const rel = posix.join(family, entry.name);
    if (!entry.isDirectory()) {
      fail(`${rel} sits in a scenario family but is not a scenario directory`);
      continue;
    }
    if (!scenarioDirs.has(rel)) {
      fail(`${rel} is present in the tree but enumerated by no scenario`);
      continue;
    }
    for (const file of readdirSync(join(here, rel))) {
      const path = posix.join(rel, file);
      if (!enumerated.has(path)) fail(`${path} is present in the tree but enumerated by no scenario`);
    }
  }
}

// --- every file in the tree -----------------------------------------------
for (const family of families) {
  let entries;
  try {
    entries = readdirSync(join(here, family));
  } catch {
    fail(`family "${family}" is declared but has no directory`);
    continue;
  }
  for (const name of entries) {
    const rel = posix.join(family, name);
    if (!statSync(join(here, rel)).isFile()) continue;
    if (!enumerated.has(rel)) fail(`${rel} is present in the tree but enumerated by no vector`);
  }
}

// --- every family carries both kinds --------------------------------------
// A family with no reject vector certifies only that a reader ACCEPTS, which is
// half a codec. A family with no round-trip vector certifies nothing about the
// bytes at all.
for (const family of families) {
  const inFamily = (manifest.vectors ?? []).filter((v) => v.family === family);
  for (const kind of KINDS) {
    if (!inFamily.some((v) => v.kind === kind)) fail(`family "${family}" enumerates no ${kind} vector`);
  }
}

// --- every closed-vocabulary arm is covered -------------------------------
// The two effect vocabularies are closed (§5.1, §5.2), so "closed" is a claim
// the corpus can be measured against: an arm with no vector lets an
// implementation certify while never having met it.
const covers = (family, needles) => {
  const text = (manifest.vectors ?? [])
    .filter((v) => v.family === family && v.kind === "round-trip")
    .map((v) => readFileSync(join(here, v.file), "utf8"))
    .join("\n");
  for (const arm of needles) {
    if (!text.includes(`"${arm}"`)) fail(`family "${family}" has no round-trip vector covering the ${arm} arm`);
  }
};

covers("server-effect", ["RunQuery", "ApplyOps", "HostCall", "EmitPatch", "Notify"]);
covers("client-effect", [
  "Navigate",
  "PushState",
  "WriteToClipboard",
  "Focus",
  "Download",
  "ReadFileBody",
  // Format version 2. `Print` is the reason this check reads the vectors' TEXT
  // rather than a declared arm name: its document is `{"kind":"Print"}`, so the
  // only thing that can witness the arm is the bytes.
  "Print",
  "Confirm",
]);

// --- the vocabulary-free documents are there to certify --------------------
// Each document the list names is one a toy-subject host certifies from the
// referenced subject's vectors, so each must have vectors of both kinds there.
for (const document of vocabularyFreeSet) {
  const carrying = (manifest.vectors ?? []).filter((v) => v.document === document && v.subject === undefined);
  for (const kind of KINDS)
    if (!carrying.some((v) => v.kind === kind))
      fail(`vocabulary-free document "${document}" has no ${kind} vector for a host of either subject to run`);
}

// The toy subject's own closed vocabularies (§10.7): the five server-effect
// arms again, and the toy's one client effect.
covers("toy-server-effect", ["RunQuery", "ApplyOps", "HostCall", "EmitPatch", "Notify"]);
covers("toy-client-effect", ["Sound"]);

// --- every document-reachable defect token is discriminated -----------------
// The same argument as `covers` above, one layer in. §7.5's vocabulary is
// closed, so an arm no vector exhibits is one every implementation certifies
// against while never having met — and this arm is worse than an uncovered
// effect, because a defect the corpus never shows is one a classifier can get
// wrong in a way `replaySafety` cannot see: two tokens of one grade produce
// one value.
//
// DISCRIMINATION, not mere presence: the vector must carry that token and no
// other, so a probe that mis-classifies the arm moves this vector's own
// expectation rather than hiding behind a second reason on the same handler.
// `handler/host-call` carries two, and satisfies this for neither.
{
  // Per subject: a toy vector discriminating an arm says nothing about a
  // reader of the referenced vocabulary, and the reverse, so each handler
  // family is held to its own reachable set.
  const pin = (family, reachable, label) => {
    const discriminating = new Map();
    for (const v of manifest.vectors ?? []) {
      if (v.family !== family || v.kind !== "round-trip") continue;
      const tokens = new Set((v.replayReasons ?? []).map((r) => r.defect));
      if (tokens.size === 1) discriminating.set([...tokens][0], v.id);
    }

    for (const defect of reachable) {
      if (!discriminating.has(defect))
        fail(
          `no ${label} round-trip vector discriminates the ${defect} arm — it needs one whose reasons name that token and no other (§7.5)`,
        );
    }

    // The other direction, so the pin cannot rot into a list of five strings: a
    // token this corpus discriminates that §7.5 does not declare is either a
    // typo or a vocabulary that grew without the text.
    for (const defect of discriminating.keys())
      if (!(defect in DEFECTS)) fail(`a vector discriminates ${JSON.stringify(defect)}, which §7.5 does not declare`);
  };

  pin("handler", DOCUMENT_REACHABLE, "handler");
  pin("toy-handler", TOY_DOCUMENT_REACHABLE, "toy-handler");

  // The toy's two absences, asserted rather than permitted: a toy vector
  // carrying either token at all would mean the toy's op or the text moved.
  for (const v of manifest.vectors ?? []) {
    if (v.family !== "toy-handler") continue;
    for (const r of v.replayReasons ?? [])
      if (TOY_UNREACHABLE.includes(r.defect))
        fail(`${v.id}: carries ${r.defect}, which no toy document can exhibit (§10.7)`);
  }
}

if (failures.length) {
  console.error(`manifest invariants violated (${failures.length}):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

const byKind = {};
for (const v of manifest.vectors) byKind[v.kind] = (byKind[v.kind] ?? 0) + 1;
const shape = Object.entries(byKind)
  .map(([k, n]) => `${n} ${k}`)
  .join(", ");
// What a host of each subject runs (§10.7): the referenced subject runs every
// vector naming no subject; the toy subject runs its own and the
// vocabulary-free documents' — the counts a harness asserts it ran (§10.1).
const referencedRuns = manifest.vectors.filter((v) => v.subject === undefined).length;
const toyRuns = manifest.vectors.filter(
  (v) => v.subject === "toy" || (v.subject === undefined && vocabularyFreeSet.has(v.document)),
).length;
console.log(
  `manifest describes its tree: ${manifest.vectors.length} vectors (${shape}) across ${families.length} families, ` +
    `and ${(manifest.scenarios ?? []).length} scenarios across ${scenarioFamilies.length} scenario families. ` +
    `A referenced-subject host runs ${referencedRuns} vectors; a toy-subject host runs ${toyRuns}.`,
);
