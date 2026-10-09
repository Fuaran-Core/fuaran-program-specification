// SPDX-License-Identifier: Apache-2.0
//
// The driver-semantics family's checker.
//
// The other two checkers are about DOCUMENTS. `emit.mjs` asks whether the
// specification's text still determines the bytes of a wire document;
// `check-manifest.mjs` asks whether the index still describes the tree it sits
// in. This one asks the third question, which belongs to neither: does a
// behavioural scenario still have the SHAPE §10.3 gives it.
//
//   node check-scenarios.mjs          # check the committed scenarios
//   node check-scenarios.mjs --write  # refresh the manifest's digests + steps
//
// What it deliberately does NOT do is reproduce a scenario. A wire document can
// be re-derived from a model by anyone who has read the text; a step trace is
// the output of a bounded program loop, and re-deriving one would mean writing a
// second interpreter. That is a real gap and it is recorded as such (§11.3), not
// papered over here: what this checker certifies is that the recorded traces are
// well-formed against §10.3, not that they are the right traces. The hosts
// certify the second thing, which is what a conformance corpus is for.
//
// Two of its checks carry more weight than their size suggests:
//
//   - the step count is `events + 1`, because index 0 is the state BEFORE any
//     event. A trace that lost that entry would still look plausible and would
//     silently stop pinning the one thing a first-divergence report exists to
//     catch — a placement that resolved the initial tree differently;
//
//   - an effect observation is a client-effect document in its AS-EMITTED form
//     (§5.2), and its member ORDER is checked. That family is the
//     specification's one enumerated envelope exception, and the natural way for
//     a host to record an effect — hand it to a canonical encoder — is exactly
//     the "fix" that would erase the exception. Checking the order is what makes
//     that mistake fail here rather than being adopted as the format;
//
//   - a recorded DENIAL is a document this specification owns, so unlike an
//     effect it is embedded as an object and unlike a tree it has no host
//     encoder to respect. What is checked is the pair of things a schema cannot
//     say: that `origin` sits only on the arm that consulted a destination, and
//     that it is an ORIGIN — a denial quoting a path or a query has become the
//     disclosure §5.3 exists to prevent.
//
// Exits non-zero, naming every violation found rather than stopping at the
// first: a corpus with three problems should take one run to discover.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** §10.3 — a scenario declares this kind, and no wire vector may. */
const SCENARIO_KIND = "step-trace";

/**
 * §10.2 and §10.6 — the declarations a host must have made for a scenario to
 * apply to it. `bounded-loop` is the one every scenario presumed until the toy
 * family; `handler-loop` presumes a placement that ANSWERS a call with a
 * host-registered handler, and so is out of scope — not failed — at a
 * placement with no handler registry. Closed, like the policy names below: an
 * obligation nobody can declare is a scenario nobody is required to run.
 */
const HOST_OBLIGATIONS = new Set(["bounded-loop", "handler-loop"]);

/**
 * §10.6 — the registered handler-set names. A handler-loop scenario NAMES one
 * and every host CONSTRUCTS what it denotes; the corpus never carries handlers
 * as data, for the reason it never carries a policy.
 */
const HOST_HANDLERS = new Set(["toy-relabel"]);

/**
 * The scenario families and the witness each is written over. A family names
 * the vocabulary its trees and effects are in, so a family this table does not
 * know is a set of files no check below could read — refused rather than passed.
 *
 *   driver-semantics      — the UI tree vocabulary (§3, a REFERENCED document:
 *                           its shape is the tree wire specification's, so it is
 *                           checked as an object and no further); effects are
 *                           §5.2's client effects.
 *   driver-semantics-toy  — the toy witness (§10.6), a vocabulary this
 *                           specification OWNS: its trees are checked member by
 *                           member, the starting tree must be in canonical form,
 *                           and its effects are the toy's one arm.
 */
const WITNESS = { "driver-semantics": "ui", "driver-semantics-toy": "toy" };

/** The three files a scenario is, and the member each is named under. */
const FILES = { tree: "tree.json", events: "events.json", expectation: "expectation.json" };

/**
 * §5.2's closed vocabulary, in DECLARATION order — which is the order those
 * documents are emitted in, and is not Ordinal order. Held here rather than
 * derived from `emit.mjs` on purpose: two checkers agreeing because they share a
 * constant is weaker than two checkers agreeing.
 */
const CLIENT_EFFECT_ARMS = {
  Navigate: ["kind", "route"],
  PushState: ["kind", "route"],
  WriteToClipboard: ["kind", "text"],
  Focus: ["kind", "nodeId"],
  Download: ["kind", "url", "name"],
  ReadFileBody: ["kind", "nodeId", "encoding"],
  // Format version 2's two arms. `Confirm` is what a bounded loop's gesture
  // emits when it asks (§10.5); `Print` carries no member but its discriminator.
  Print: ["kind"],
  Confirm: ["kind", "prompt", "token"],
};

/**
 * §5.3's denial arms, and which of them `origin` may sit on.
 *
 * `origin` is the member that says WHICH USE a `GateRefused` refused, and it
 * belongs to that arm alone: an `Unregistered` denial says the capability was
 * never reachable, at which point no destination was ever consulted. A denial
 * carrying one anyway is a member that cannot describe the fact it sits beside,
 * which §5.3 refuses for the reason §5.1 refuses a self-declared capability.
 */
const DENIAL_ARMS = {
  Unregistered: { origin: false },
  GateRefused: { origin: true },
};

/**
 * §10.3's registered host-policy names. A scenario recording denials declares
 * one, and every host CONSTRUCTS what it denotes — the corpus never carries a
 * policy as data, because a corpus that did would be specifying one.
 *
 * The set is closed here so that an unrecognised name fails at the corpus rather
 * than at whichever host reads it next. A host falling back to its default on a
 * name it did not recognise would report a scenario it could not evaluate as one
 * it passed, which is the vacuous green this family's obligations exist to
 * refuse; the same argument applies one level up, to the index.
 */
const HOST_POLICIES = new Set(["local-egress-only"]);

/** §10.6 — the toy's one effect arm, in the order its emitter writes members. */
const TOY_EFFECT_ARMS = {
  Sound: ["kind", "nodeId", "volume"],
};

/** §10.6 — the toy vocabulary: each case's required and optional members. */
const TOY_EXPR = {
  Const: { req: ["value"], opt: [] },
  Read: { req: ["key"], opt: [] },
  Fail: { req: ["message"], opt: [] },
  Missing: { req: [], opt: [] },
  Hole: { req: ["placeholder"], opt: [] },
};
const TOY_ACTION = {
  Seq: { req: ["actions"], opt: [] },
  Put: { req: ["key"], opt: ["from", "value"] },
  Ring: { req: ["endpoint", "targeted"], opt: [] },
  Need: { req: ["condition"], opt: [] },
  Pick: { req: ["entry", "whenFalse", "whenTrue"], opt: ["exit"] },
  Times: { req: ["body", "bound"], opt: [] },
  ForEach: { req: ["body", "collection", "placeholder"], opt: [] },
  Beep: { req: ["volume"], opt: [] },
  Hush: { req: [], opt: [] },
};

/** A toy identifier — a node id or an op target (§10.6). */
const TOY_ID = /^[A-Za-z0-9._-]+$/;

const isCount = (v) => Number.isInteger(v) && v >= 0;
const isText = (v) => typeof v === "string" && v.length > 0;

/**
 * Every violation in a toy node, as `path: problem`. Hand-rolled rather than a
 * schema validator for the reason this file exists at all: the rules a schema
 * can state are the easy half, and a second reader is worth more than a
 * restatement of the first.
 */
function toyNodeProblems(n, path) {
  const out = [];
  const bad = (m) => out.push(`${path}: ${m}`);
  if (n === null || typeof n !== "object" || Array.isArray(n)) return [`${path}: a node is not an object`];
  const keys = Object.keys(n);
  if (!sameSequence(keys.slice().sort(), ["children", "handlers", "id", "label"]))
    bad(`a node declares ${JSON.stringify(keys)}, not children / handlers / id / label`);
  if (!isText(n.id) || !TOY_ID.test(n.id)) bad(`node id ${JSON.stringify(n.id)} is not an identifier`);
  out.push(...toyExprProblems(n.label, `${path}.label`));
  if (!Array.isArray(n.handlers)) bad("handlers is not an array");
  else
    n.handlers.forEach((h, i) => {
      const hp = `${path}.handlers[${i}]`;
      if (h === null || typeof h !== "object" || !sameSequence(Object.keys(h).sort(), ["action", "event"]))
        out.push(`${hp}: a handler declares action / event and nothing else`);
      else {
        if (!isText(h.event)) out.push(`${hp}: names no event`);
        out.push(...toyActionProblems(h.action, `${hp}.action`));
      }
    });
  if (!Array.isArray(n.children)) bad("children is not an array");
  else n.children.forEach((c, i) => out.push(...toyNodeProblems(c, `${path}.children[${i}]`)));
  return out;
}

function toyCaseProblems(v, path, table, what) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return [`${path}: ${what} is not an object`];
  const shape = table[v.$type];
  if (!shape) return [`${path}: ${JSON.stringify(v.$type)} is not a toy ${what}`];
  const out = [];
  for (const k of shape.req) if (!(k in v)) out.push(`${path}: ${v.$type} lacks ${k}`);
  for (const k of Object.keys(v))
    if (k !== "$type" && !shape.req.includes(k) && !shape.opt.includes(k))
      out.push(`${path}: ${v.$type} carries undeclared ${k}`);
  return out;
}

function toyExprProblems(e, path) {
  const out = toyCaseProblems(e, path, TOY_EXPR, "expression");
  if (out.length) return out;
  if (e.$type === "Read" && !isText(e.key)) out.push(`${path}: Read names no key`);
  if (e.$type === "Hole" && !isText(e.placeholder)) out.push(`${path}: Hole names no placeholder`);
  if (e.$type === "Fail" && typeof e.message !== "string") out.push(`${path}: Fail carries no message`);
  return out;
}

function toyActionProblems(a, path) {
  const out = toyCaseProblems(a, path, TOY_ACTION, "action");
  if (out.length) return out;
  switch (a.$type) {
    case "Seq":
      if (!Array.isArray(a.actions)) out.push(`${path}: Seq's actions is not an array`);
      else a.actions.forEach((x, i) => out.push(...toyActionProblems(x, `${path}.actions[${i}]`)));
      break;
    case "Put":
      if (!isText(a.key)) out.push(`${path}: Put names no key`);
      if ("from" in a) out.push(...toyExprProblems(a.from, `${path}.from`));
      break;
    case "Ring":
      if (!isText(a.endpoint)) out.push(`${path}: Ring names no endpoint`);
      if (typeof a.targeted !== "boolean") out.push(`${path}: Ring's targeted is not a boolean`);
      break;
    case "Need":
      out.push(...toyExprProblems(a.condition, `${path}.condition`));
      break;
    case "Pick":
      out.push(...toyExprProblems(a.entry, `${path}.entry`));
      out.push(...toyActionProblems(a.whenTrue, `${path}.whenTrue`));
      out.push(...toyActionProblems(a.whenFalse, `${path}.whenFalse`));
      if ("exit" in a) out.push(...toyExprProblems(a.exit, `${path}.exit`));
      break;
    case "Times":
      if (typeof a.bound === "number") {
        if (!isCount(a.bound)) out.push(`${path}: a literal bound is not a count`);
      } else if (a.bound && a.bound.$type === "Parameter") {
        const keys = Object.keys(a.bound).sort();
        if (!sameSequence(keys, ["$type", "count", "hi", "lo"]))
          out.push(`${path}: a Parameter bound declares ${JSON.stringify(keys)}`);
        else {
          out.push(...toyExprProblems(a.bound.count, `${path}.bound.count`));
          if (!isCount(a.bound.lo) || !isCount(a.bound.hi) || a.bound.lo > a.bound.hi)
            out.push(`${path}: a Parameter bound's lo / hi are not counts with lo <= hi`);
        }
      } else out.push(`${path}: a bound is a count or a Parameter`);
      out.push(...toyActionProblems(a.body, `${path}.body`));
      break;
    case "ForEach":
      if (!Array.isArray(a.collection)) out.push(`${path}: ForEach's collection is not an array`);
      if (!isText(a.placeholder)) out.push(`${path}: ForEach names no placeholder`);
      out.push(...toyActionProblems(a.body, `${path}.body`));
      break;
    case "Beep":
      if (!isCount(a.volume)) out.push(`${path}: Beep's volume is not a count`);
      break;
  }
  return out;
}

/** §2.7's escaping: `"`, `\` and the control range as lower-case `\u00xx`. */
const escapeCanonical = (s) =>
  s.replace(/["\\\u0000-\u001f]/g, (c) =>
    c === '"' ? '\\"' : c === "\\" ? "\\\\" : "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );

/**
 * §2's canonical rendering — members Ordinal (UTF-16 code units, which is what
 * a JavaScript string comparison is), no whitespace, integers bare. The toy is
 * a vocabulary this specification OWNS, so unlike a UI tree its starting tree
 * is held to these bytes.
 */
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v !== null && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => `"${escapeCanonical(k)}":${canonical(v[k])}`)
        .join(",") +
      "}"
    );
  if (typeof v === "string") return `"${escapeCanonical(v)}"`;
  return JSON.stringify(v);
}

const failures = [];
const fail = (m) => failures.push(m);

const manifestPath = join(here, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const scenarios = manifest.scenarios ?? [];
const scenarioFamilies = new Set(manifest.scenarioFamilies ?? []);

const write = process.argv.includes("--write");

if (!scenarios.length) fail("the manifest enumerates no scenario");
if (!scenarioFamilies.size) fail("the manifest declares no scenario family");

/** A member-name sequence, in the order the document spells it. */
const keysOf = (o) => Object.keys(o);

const sameSequence = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Every JSON `null` reachable in a value — §2.5 reaches every nesting depth. */
const hasNull = (v) => {
  if (v === null) return true;
  if (Array.isArray(v)) return v.some(hasNull);
  if (typeof v === "object") return Object.values(v).some(hasNull);
  return false;
};

let effectsSeen = 0;
let denialsSeen = 0;
/** Per family: scenarios, steps and effects seen, for the coverage pins and the report. */
const perFamily = {};

for (const s of scenarios) {
  const id = s.id ?? "(anonymous scenario)";

  if (s.hostPolicy !== undefined && !HOST_POLICIES.has(s.hostPolicy))
    fail(
      `${id}: hostPolicy ${JSON.stringify(s.hostPolicy)} is not a name §10.3 registers — a host cannot construct it, and falling back to its own default would report a scenario it could not evaluate as one it passed`,
    );

  if (s.kind !== SCENARIO_KIND) fail(`${id}: kind is ${JSON.stringify(s.kind)}, not "${SCENARIO_KIND}"`);
  if (!HOST_OBLIGATIONS.has(s.requires))
    fail(`${id}: requires is ${JSON.stringify(s.requires)}, which is not an obligation §10.2 or §10.6 names`);

  const witness = WITNESS[s.family];
  if (scenarioFamilies.has(s.family) && !witness)
    fail(`${id}: family ${JSON.stringify(s.family)} names no witness this checker can read (§10.6)`);
  const tally = (perFamily[s.family] ??= { scenarios: 0, steps: 0, effects: 0 });
  tally.scenarios += 1;

  // §10.6 — a handler set is named exactly when the scenario presumes a loop
  // that answers calls, and only the toy family registers one.
  if (s.requires === "handler-loop" && s.hostHandlers === undefined)
    fail(`${id}: requires handler-loop but names no hostHandlers — a host cannot construct handlers it was never told about`);
  if (s.requires !== "handler-loop" && s.hostHandlers !== undefined)
    fail(`${id}: names hostHandlers but presumes the bounded loop, which answers no call`);
  if (s.hostHandlers !== undefined && !HOST_HANDLERS.has(s.hostHandlers))
    fail(`${id}: hostHandlers ${JSON.stringify(s.hostHandlers)} is not a name §10.6 registers`);
  if (s.requires === "handler-loop" && witness !== "toy")
    fail(`${id}: the handler-loop obligation is registered for the toy family only (§10.6)`);
  if (witness === "toy" && s.hostPolicy !== undefined)
    fail(`${id}: the toy family registers no host policy, so a toy scenario cannot name one (§10.6)`);
  if (!scenarioFamilies.has(s.family)) fail(`${id}: family ${JSON.stringify(s.family)} is not a declared scenario family`);
  if (!s.name) fail(`${id}: no name`);
  if (!s.description) fail(`${id}: no description`);
  if (s.name && s.dir !== posix.join(s.family ?? "", s.name))
    fail(`${id}: dir "${s.dir}" is not "${s.family}/${s.name}"`);

  const files = s.files ?? {};
  const bytes = {};
  let readable = true;

  for (const [member, basename] of Object.entries(FILES)) {
    const expected = posix.join(s.dir ?? "", basename);
    if (files[member] !== expected) {
      fail(`${id}: files.${member} is ${JSON.stringify(files[member])}, not "${expected}"`);
      readable = false;
      continue;
    }
    try {
      bytes[member] = readFileSync(join(here, expected));
    } catch {
      fail(`${id}: "${expected}" is enumerated but not present`);
      readable = false;
      continue;
    }
    const b = bytes[member];
    // A scenario file is digested, so a trailing newline is a byte like any
    // other — the same rule the wire vectors carry, for the same reason.
    if (b.length && b[b.length - 1] === 0x0a) fail(`${id}: ${member} ends with a newline`);
    if (b.includes(0x0d)) fail(`${id}: ${member} contains a CR — the checkout is not honouring the LF pin`);
    if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) fail(`${id}: ${member} carries a byte-order mark`);
  }

  if (!readable) continue;

  const parse = (member) => {
    try {
      return JSON.parse(bytes[member].toString("utf8"));
    } catch (e) {
      fail(`${id}: ${member} does not parse (${e.message})`);
      return undefined;
    }
  };

  const tree = parse("tree");
  const events = parse("events");
  const expectation = parse("expectation");

  if (write) {
    s.sha256 = Object.fromEntries(
      Object.keys(FILES).map((m) => [m, createHash("sha256").update(bytes[m]).digest("hex")]),
    );
    if (Array.isArray(expectation)) s.steps = expectation.length;
    continue;
  }

  const digests = s.sha256 ?? {};
  for (const member of Object.keys(FILES)) {
    const got = createHash("sha256").update(bytes[member]).digest("hex");
    if (got !== digests[member]) fail(`${id}: ${member} sha256 is ${digests[member]} but the file hashes to ${got}`);
  }

  if (tree !== undefined) {
    if (tree === null || typeof tree !== "object" || Array.isArray(tree)) fail(`${id}: the tree is not a JSON object`);
    else if (hasNull(tree)) fail(`${id}: the tree carries a JSON null (§2.5 reaches every nesting depth)`);
    else if (witness === "toy") {
      for (const p of toyNodeProblems(tree, "tree")) fail(`${id}: ${p}`);
      // The toy tree is a document this specification owns, so its starting
      // file IS its canonical bytes — the same rule a wire vector carries.
      if (canonical(tree) !== bytes.tree.toString("utf8"))
        fail(`${id}: the starting tree is not in canonical form (§2) — a toy tree is owned here, so its file is its canonical bytes`);
    }
  }

  if (events !== undefined) {
    if (!Array.isArray(events)) fail(`${id}: the event script is not an array`);
    else
      events.forEach((ev, i) => {
        if (!sameSequence(keysOf(ev), ["nodeId", "event", "payload"]))
          fail(`${id}: event ${i} declares ${JSON.stringify(keysOf(ev))}, not nodeId / event / payload`);
        if (typeof ev.nodeId !== "string" || !ev.nodeId) fail(`${id}: event ${i} names no node`);
        if (typeof ev.event !== "string" || !ev.event) fail(`${id}: event ${i} names no event`);
        if (ev.payload === null || typeof ev.payload !== "object" || Array.isArray(ev.payload))
          fail(`${id}: event ${i} carries no payload object`);
      });
  }

  if (expectation !== undefined && Array.isArray(expectation) && Array.isArray(events)) {
    // The load-bearing arithmetic: index 0 is the state BEFORE any event, so a
    // trace is one longer than the script that drove it.
    if (expectation.length !== events.length + 1)
      fail(
        `${id}: ${expectation.length} step(s) recorded for ${events.length} event(s) — a trace carries one entry per step, index 0 being the state before any event`,
      );
    if (expectation.length !== s.steps)
      fail(`${id}: the manifest declares ${s.steps} step(s) and the trace carries ${expectation.length}`);

    // §10.3 — `denials` is optional and APPENDED, so a trace that predates it is
    // byte-identical and only the two sequences below are well-formed. The
    // member's position is checked rather than merely its presence: a trace
    // spelling it before `refused` would still parse, and the whole reason the
    // member was appended is that a recorded shape does not move.
    const stepMembers = [
      ["tree", "effects", "refused"],
      ["tree", "effects", "refused", "denials"],
    ];

    // A scenario that names a policy and records no denial anywhere is either a
    // policy that declines nothing — in which case naming it says nothing — or a
    // runner that never consulted the seam while claiming to. Both are worth a
    // finding, and neither is visible from a single step.
    let policyDenials = 0;
    let policyObserved = 0;

    expectation.forEach((step, i) => {
      if (!stepMembers.some((shape) => sameSequence(keysOf(step), shape)))
        fail(
          `${id}: step ${i} declares ${JSON.stringify(keysOf(step))}, not tree / effects / refused [/ denials]`,
        );

      if (step.tree === null || typeof step.tree !== "object" || Array.isArray(step.tree))
        fail(`${id}: step ${i} records no tree object — a step's tree is an embedded DOCUMENT, never a string of one host's bytes`);
      else if (hasNull(step.tree)) fail(`${id}: step ${i}'s tree carries a JSON null`);
      else if (witness === "toy") for (const p of toyNodeProblems(step.tree, `step ${i} tree`)) fail(`${id}: ${p}`);

      tally.steps += 1;

      if (typeof step.refused !== "boolean") fail(`${id}: step ${i} records no boolean refusal`);

      if (step.denials !== undefined) {
        policyObserved += 1;
        if (!Array.isArray(step.denials)) {
          fail(`${id}: step ${i} records a denials member that is not an array`);
        } else {
          if (s.hostPolicy === undefined)
            fail(
              `${id}: step ${i} records denials but the scenario names no hostPolicy — a denial is a fact about a policy, and a host cannot reproduce one it was never told to construct (§10.3)`,
            );
          if (i === 0 && step.denials.length)
            fail(`${id}: step 0 is the state before any event, so nothing can have been declined in it`);
          step.denials.forEach((d, j) => {
            denialsSeen += 1;
            policyDenials += 1;
            if (d === null || typeof d !== "object" || Array.isArray(d)) {
              fail(
                `${id}: step ${i} denial ${j} is not an object — a denial is a document this specification OWNS (§5.3), embedded rather than carried as one host's bytes`,
              );
              return;
            }
            const arm = DENIAL_ARMS[d.$type];
            if (!arm) {
              fail(
                `${id}: step ${i} denial ${j} names ${JSON.stringify(d.$type)}, which is not an arm of the denial vocabulary (§5.3)`,
              );
              return;
            }
            // §2.3 governs this document without exception, so its members are
            // Ordinal — and `$type` < `capability` < `origin` already is that
            // order, which is why the check reads as a declaration order and is
            // not one.
            const declared = arm.origin && d.origin !== undefined ? ["$type", "capability", "origin"] : ["$type", "capability"];
            if (!sameSequence(keysOf(d), declared))
              fail(
                `${id}: step ${i} denial ${j} spells its members ${JSON.stringify(keysOf(d))}, not ${JSON.stringify(declared)}`,
              );
            if (!arm.origin && d.origin !== undefined)
              fail(
                `${id}: step ${i} denial ${j} carries an origin on ${d.$type}, which never consulted a destination (§5.3)`,
              );
            if (typeof d.capability !== "string" || !d.capability)
              fail(`${id}: step ${i} denial ${j} names no capability`);
            if (d.origin !== undefined && (typeof d.origin !== "string" || !d.origin))
              fail(`${id}: step ${i} denial ${j} carries an empty origin`);
            // The log-safety rule, made mechanical. An origin is a HOST or a
            // destination class; a path, a query or a scheme prefix means the
            // record has quoted the payload it exists to refuse.
            if (typeof d.origin === "string" && /[\/?#]/.test(d.origin))
              fail(
                `${id}: step ${i} denial ${j} records an origin ${JSON.stringify(d.origin)} carrying a path, query or fragment — a denial names the ORIGIN, never the URL (§5.3)`,
              );
          });
        }
      }

      if (!Array.isArray(step.effects)) {
        fail(`${id}: step ${i} records no effect array`);
        return;
      }

      if (i === 0 && (step.effects.length || step.refused))
        fail(`${id}: step 0 is the state before any event, so nothing can have been emitted or refused in it`);

      step.effects.forEach((raw, j) => {
        if (typeof raw !== "string") {
          fail(`${id}: step ${i} effect ${j} is not a string — an effect is recorded AS EMITTED (§5.2), and embedding it as an object would licence a writer to reorder its members`);
          return;
        }
        let doc;
        try {
          doc = JSON.parse(raw);
        } catch (e) {
          fail(`${id}: step ${i} effect ${j} does not parse (${e.message})`);
          return;
        }
        tally.effects += 1;
        if (witness === "toy") {
          // §10.6 — the toy's effect adopts §5.2's envelope (a `kind`
          // discriminator, members in the emitter's order), and its one arm.
          const toyDeclared = TOY_EFFECT_ARMS[doc?.kind];
          if (!toyDeclared) {
            fail(`${id}: step ${i} effect ${j} names ${JSON.stringify(doc?.kind)}, which is not the toy's effect arm (§10.6)`);
            return;
          }
          if (!sameSequence(keysOf(doc), toyDeclared))
            fail(
              `${id}: step ${i} effect ${j} spells its members ${JSON.stringify(keysOf(doc))} — the toy emitter writes ${JSON.stringify(toyDeclared)} in that order (§10.6)`,
            );
          if (!TOY_ID.test(doc.nodeId ?? "") || !isCount(doc.volume))
            fail(`${id}: step ${i} effect ${j} carries a nodeId that is not an identifier or a volume that is not a count`);
          return;
        }
        effectsSeen += 1;
        const declared = CLIENT_EFFECT_ARMS[doc?.kind];
        if (!declared) {
          fail(`${id}: step ${i} effect ${j} names ${JSON.stringify(doc?.kind)}, which is not an arm of the closed vocabulary (§5.2)`);
          return;
        }
        if (!sameSequence(keysOf(doc), declared))
          fail(
            `${id}: step ${i} effect ${j} spells its members ${JSON.stringify(keysOf(doc))} — §5.2 emits them in declaration order ${JSON.stringify(declared)}, and re-ordering them is the "fix" that erases the enumerated exception`,
          );
      });
    });

    if (s.hostPolicy !== undefined) {
      if (policyObserved !== expectation.length)
        fail(
          `${id}: names the hostPolicy ${JSON.stringify(s.hostPolicy)} but ${expectation.length - policyObserved} of its ${expectation.length} step(s) omit denials — a runner that consulted the seam says so at every step, and an omitted member means none-or-UNOBSERVED (§10.3)`,
        );
      if (!policyDenials)
        fail(
          `${id}: names the hostPolicy ${JSON.stringify(s.hostPolicy)} and records no denial anywhere, so the policy it names is doing nothing the trace can see`,
        );
    }
  }
}

if (write) {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`refreshed digests and step counts for ${scenarios.length} scenario(s)`);
  process.exit(0);
}

// A family whose every scenario emitted nothing would pass every check above
// while never once exercising the envelope rule that is half the reason this
// checker exists.
if (!effectsSeen) fail("no scenario records a client effect, so the as-emitted envelope rule is never exercised");

// And the same argument for the member added beside it. A `denials` nobody
// records is a specified member no host has ever had to produce or read, which
// is the shape §5.5 calls silence — here applied to the corpus rather than to a
// host.
if (!denialsSeen)
  fail("no scenario records a denial, so §5.3's shape and §10.3's denials member are never exercised");

// Every declared family is enumerated by some scenario and records some
// effect: a family whose every step emitted nothing would never once exercise
// its effect rule, the toy family's included.
for (const family of scenarioFamilies) {
  const t = perFamily[family];
  if (!t) fail(`scenario family "${family}" is declared and enumerates no scenario`);
  else if (!t.effects) fail(`no ${family} scenario records an effect, so that family's effect rule is never exercised`);
}

if (failures.length) {
  console.error(`driver-semantics scenarios violated (${failures.length}):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

const steps = scenarios.reduce((n, s) => n + (s.steps ?? 0), 0);
console.log(
  `all scenario families: ${scenarios.length} scenario(s), ${steps} recorded step(s), ${effectsSeen} client effect(s) in as-emitted form, ${denialsSeen} denial(s).`,
);
for (const [family, t] of Object.entries(perFamily))
  console.log(`  ${family}: ${t.scenarios} scenario(s), ${t.steps} step(s), ${t.effects} effect(s).`);
