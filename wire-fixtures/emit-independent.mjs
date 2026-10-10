// SPDX-License-Identifier: Apache-2.0
//
// The SECOND emitter for the program wire conformance corpus.
//
// One emitter cannot tell the protocol from its own accidents: whatever it
// does becomes "the format" simply because it is the only thing producing
// bytes. A second emitter, written from PROGRAM_WIRE.md alone and never from
// the other emitter, is what turns "these bytes are what we emit" into "these
// bytes are what the text says". Where the two disagree, the finding is about
// the TEXT — it failed to determine something one of them decided — and the
// remedy is in the text, not in whichever emitter looks wrong.
//
// Zero dependencies; Node's own crypto and fs only. No build step.
//
//   node emit-independent.mjs              # check against the committed corpus
//   node emit-independent.mjs --emit-json  # dump {file: document} for comparison
//
// ── What is independently derived, and what is not ───────────────────────
//
// DERIVED here, from the specification and nothing else:
//
//   the envelopes and their discriminators (§2.6, §4.1, §4.2, §5.1, §5.3,
//   §6.3, §6.5, §8.3, §9.2); which members are present and which are omitted
//   rather than nulled (§2.5); Ordinal member ordering at every depth (§2.3);
//   string escaping in both of the specification's two flavours (§2.7 and
//   §5.2's short escapes); number rendering (§2.8); the declaration order of
//   the client-effect family (§5.2); and the replay classification of §7.4
//   together with the reasons of §7.5, both recomputed from the stage models
//   rather than read off the manifest.
//
// At the TOY subject (§10.7) the same families carry the toy witness's own
// vocabulary (§10.6) in the referenced positions, and the replay
// classification is derived from §10.7's table of the toy's cases — a second
// walk, beside §7.4's, never the first walk applied to strange tags.
//
// NOT derived, and honestly so: the reference VALUES. No text can say that a
// handler is named `orders.refresh` or that a download names `report.csv` —
// those are the corpus's chosen examples, and both emitters hold them as
// inputs. What the two emitters can disagree about is everything in the list
// above, which is the whole of what the specification actually specifies.
//
// ── Two deliberate asymmetries with the resident emitter ─────────────────
//
// **This emitter cannot write.** There is no `--write` mode and there must
// not be. A second writer would let a divergence be settled by rewriting the
// corpus, which is exactly the move the arrangement exists to prevent: a
// divergence is a question for the text, and the text answers it before any
// byte moves. Only the resident emitter mints bytes.
//
// **Reject vectors are absent**, for the reason the resident emitter states:
// they are documents a reader must REFUSE, so reproducing their bytes
// demonstrates nothing about the refusal. Certify against them by feeding
// each to your own reader and requiring the class the manifest names.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// ── §2 · the canonical encoding ──────────────────────────────────────────

/**
 * §2.3 — Ordinal comparison of keys: by code unit, not culture-aware and not
 * case-insensitive. Written out rather than left to a default sort, because
 * "the default happens to be ordinal in this runtime" is not a derivation.
 */
const ordinal = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * §2.7 — escape `"`, `\` and the control range U+0000–U+001F as `\u00xx` in
 * lower-case hex, and nothing else. Notably NOT the short escapes: on this
 * side of the wire a tab carries its numeric escape, never a short one.
 */
const escapeCanonical = (s) => {
  let out = "";
  for (const ch of s) {
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch <= "\u001f") out += "\\u" + ch.codePointAt(0).toString(16).padStart(4, "0");
    else out += ch;
  }
  return out;
};

/**
 * §5.2 — the same rule with one difference the specification states outright:
 * this family's encoder spells the three common control characters with their
 * short escapes rather than as `\u00xx`. Implemented rather than assumed
 * equal, because §5.2 says a document carrying one differs from what the
 * canonical encoder would produce, and an encoder that ignored that would be
 * agreeing with the other emitter instead of with the text.
 */
const SHORT = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };
const escapeAsEmitted = (s) => {
  let out = "";
  for (const ch of s) {
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (SHORT[ch]) out += SHORT[ch];
    else if (ch <= "\u001f") out += "\\u" + ch.codePointAt(0).toString(16).padStart(4, "0");
    else out += ch;
  }
  return out;
};

/** §2.8 — an integer renders without a fractional part. */
const renderNumber = (n) => {
  if (!Number.isFinite(n)) throw new Error(`${n} has no rendering on this wire (§2.8)`);
  return String(n);
};

/**
 * The §2 encoder. `undefined` marks an absent optional member and is DROPPED
 * (§2.5): there is no path through this function that can emit the token
 * `null`, which is how the rule is enforced rather than remembered.
 *
 * The recursion reaches every object at every depth, opaque payload positions
 * included — a payload this specification does not decompose is still a JSON
 * object on this wire, and §2's rules are properties of the wire.
 */
const encodeCanonical = (value, esc = escapeCanonical) => {
  if (value === null || value === undefined) throw new Error("this wire carries no null (§2.5)");
  if (typeof value === "string") return '"' + esc(value) + '"';
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return renderNumber(value);
  if (Array.isArray(value)) return "[" + value.map((v) => encodeCanonical(v, esc)).join(",") + "]";

  const members = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort(ordinal)
    .map((k) => '"' + esc(k) + '":' + encodeCanonical(value[k], esc));
  return "{" + members.join(",") + "}";
};

/**
 * §5.2's enumerated exception, in its own function so that the exception is a
 * fact about this file rather than a comment in it: members in DECLARATION
 * order — which is the order §5.2's table lists them, `kind` first — and the
 * as-emitted escaping above. Feeding this family to `encodeCanonical` would
 * re-order `Download` and `ReadFileBody` and quietly erase the one thing the
 * family exists to pin.
 */
const encodeClientEffect = (members) =>
  "{" + members.map(([k, v]) => '"' + escapeAsEmitted(k) + '":' + encodeCanonical(v, escapeAsEmitted)).join(",") + "}";

const digest = (text) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

// ── §3 · referenced positions ────────────────────────────────────────────
//
// Values of vocabularies specified elsewhere: a compute stage's action, an
// op-bearing effect's ops, a read effect's source and pipeline, the patches an
// outcome ships, and the evaluator diagnostic a `Bounded` arm passes through.
// They are modelled as plain values and encoded through the SAME §2 encoder,
// which is what §3 rule 1's byte-stable splice means in practice: both
// encoders sort Ordinally, so the composite has one canonical form. This
// derives their ORDERING and ESCAPING and says nothing about their SEMANTICS,
// which their own specifications own and their own corpora certify.

const aRemoveNode = (target) => ({ $type: "RemoveNode", target });
// Names a parent and an ordering of its children — a position among siblings,
// which is the thing §7.4 contrasts with naming a target node.
const aReorderChildren = (parentId, newOrder) => ({ $type: "ReorderChildren", newOrder, parentId });
const aNavigate = (route) => ({ $type: "Navigate", route });
const aSetStateLiteral = (key, value) => ({ $type: "SetState", key, value });
const aSetStateBound = (key, valueFrom) => ({ $type: "SetState", key, valueFrom });
const aSelection = (nodeId, field) => ({ $type: "Selection", field, nodeId });
const aCall = (endpoint) => ({ $type: "Call", endpoint });
const aChain = (ops) => ({ $type: "Chain", ops });
const aNamedSource = (ref) => ({ ref, schema: [] });
const aLimit = (n, offset) => ({ $type: "limit", n, offset });
const aBoundedDiagnostic = (type, fields) => ({ $type: type, ...fields });

// ── §4, §5, §6, §8, §9 · the document models ─────────────────────────────

// §4.2 — exactly two stage kinds, and sequencing is not a third.
const computeStage = (action) => ({ $type: "Compute", action });
const effectStage = (effect) => ({ $type: "Effect", effect });

// §5.1 — the six server-effect arms. `into` is optional and, when absent, is
// absent: `undefined` here is what §2.5's omission looks like in a model.
const runQuery = (name, source, pipeline) => ({ $type: "RunQuery", name, pipeline, source });
const applyOps = (ops) => ({ $type: "ApplyOps", ops });
const hostCall = (fn, args, into) => ({ $type: "HostCall", args, fn, into });
const emitPatch = (ops) => ({ $type: "EmitPatch", ops });
const notify = (channel, payload) => ({ $type: "Notify", channel, payload });
// The sixth (format version 3): the host's two tokens and the message.
const reportFinding = (code, severity, message) => ({ $type: "Report", code, message, severity });

// §4.1 — a name and an ordered stage list, and nothing else.
const handlerDoc = (name, stages) => ({ $type: "Handler", name, stages });

// §6.3 — every member required even when empty, so an omitted array and an
// empty one are never two spellings of one fact.
const handlerReport = (committed, diagnostics, notifications, patches, performed) => ({
  $type: "HandlerReport",
  committed,
  diagnostics,
  notifications,
  patches,
  performed,
});

// ── §7.4, §7.5 · the derived replay classification and its reasons ───────
//
// Derived from the stage list, never declared — and recomputed here rather
// than read off the manifest, because a derived value nobody re-derives is a
// constant with a longer name.
//
// §7.5 makes the REASONS the primitive: the classification is the verdict its
// reasons carry, and MUST NOT be walked a second time. So there is one walk
// here producing reasons, and the value falls out of the grade table below.
// The alternative — a `classify` returning a value beside a `reasons`
// returning tokens — is two copies of one rule, and §7.5 says why a reason
// that disagrees with its own verdict is worse than no reason.
//
// `unsafe` dominates `unknown`, which dominates `safe`: a handler's
// classification is the strongest claim its weakest stage permits.

const STRENGTH = { safe: 0, unknown: 1, unsafe: 2 };
const weaker = (a, b) => (STRENGTH[a] >= STRENGTH[b] ? a : b);

/** §7.5's third column: the grade each token of the closed vocabulary forces. */
const FORCES = {
  "opaque-host-call": "unsafe",
  "outbound-notification": "unsafe",
  // §7.4 — a read the host stages, under a declared `reaching` posture.
  "staged-query": "unsafe",
  "relative-addressing": "unknown",
  "non-literal-write": "unknown",
  "undecidable-action": "unknown",
  // §7.5 — a defect in a reader's own rendering of a referenced position, so
  // no document exhibits it and no vector carries it. Listed because the
  // vocabulary is closed and a table missing an arm is not a closed table.
  "unencodable-op": "unknown",
};

/** Distinct, keeping first appearance: the order is part of the expectation. */
const once = (tokens) => tokens.filter((t, i) => tokens.indexOf(t) === i);

/** Provably re-runnable when it addresses a target node absolutely. */
const opDefects = (op) =>
  typeof op.target === "string" && op.target.length > 0 ? [] : ["relative-addressing"];

const actionDefects = (action) => {
  switch (action.$type) {
    // Inert inside a stage (§4.2), so re-running it changes nothing.
    case "Call":
      return [];
    // A chain is re-runnable exactly when every action it composes is. Reading
    // "a chain" as unconditional would classify a chain holding a bound write
    // as `safe` and contradict the rule two clauses below — and would do it
    // one level under the stage the walk reports on.
    case "Chain":
      return once(action.ops.flatMap(actionDefects));
    // A literal write re-runs; a write taking its value from a binding is
    // resolved against a store that has moved, and is undecided.
    case "SetState":
      return action.valueFrom === undefined && action.value !== undefined ? [] : ["non-literal-write"];
    default:
      return ["undecidable-action"];
  }
};

// `posture` is the host's declaration the vector names (§7.4) — an input to
// the walk, not something the document says. Only `reaching` makes a read a
// reach; absent is the in-memory fold.
const effectDefects = (effect, posture) => {
  switch (effect.$type) {
    case "RunQuery":
      return posture === "reaching" ? ["staged-query"] : [];
    case "ApplyOps":
    case "EmitPatch":
      return effect.ops.flatMap(opDefects);
    // Provably reaches outside, and the two are kept apart because they are
    // two different things to go and fix.
    case "HostCall":
      return ["opaque-host-call"];
    case "Notify":
      return ["outbound-notification"];
    // A finding is recorded, not delivered: nothing a second run would do
    // differently, so no reason.
    case "Report":
      return [];
    default:
      return ["undecidable-action"];
  }
};

/**
 * §7.5 — a reason is a stage ORDINAL and a defect token, distinct within a
 * stage and never merged across stages.
 */
const replayReasonsOf = (handler, actionWalk = actionDefects, posture = undefined) =>
  handler.stages.flatMap((stage, ordinal) =>
    once(stage.$type === "Compute" ? actionWalk(stage.action) : effectDefects(stage.effect, posture)).map(
      (defect) => ({
        stage: ordinal,
        defect,
      }),
    ),
  );

const replayClass = (handler, actionWalk = actionDefects, posture = undefined) =>
  replayReasonsOf(handler, actionWalk, posture).reduce((acc, reason) => weaker(acc, FORCES[reason.defect]), "safe");

// §10.7 · the toy subject's walk. One row per toy case, read off the table:
// what the case is in the algebra (§10.6) decides what it contributes, and
// nothing about the referenced vocabulary's spellings enters into it.
const toyDefects = (action) => {
  const t = action.$type;
  // call — inert inside a stage, so a re-run changes nothing (§4.2).
  if (t === "Ring") return [];
  // sequence — as strong as the weakest of its members.
  if (t === "Seq") return once(action.actions.flatMap(toyDefects));
  // assign — a literal `value` re-runs; a `from`, of any expression, is
  // resolved at dispatch against a store that has moved.
  if (t === "Put") return "from" in action && action.from !== undefined ? ["non-literal-write"] : [];
  // choose — which arm runs is resolved at dispatch; both arms are read.
  if (t === "Pick") return once(["undecidable-action", ...toyDefects(action.whenTrue), ...toyDefects(action.whenFalse)]);
  // repeat — a literal bound re-runs the same body the same number of times;
  // a parameter bound is itself resolved at dispatch.
  if (t === "Times")
    return Number.isInteger(action.bound) ? toyDefects(action.body) : once(["undecidable-action", ...toyDefects(action.body)]);
  // each — the body once per element of a literal collection; substituting an
  // element for a `Hole` changes no case, and no element means no run.
  if (t === "ForEach") return once(action.collection.flatMap(() => toyDefects(action.body)));
  // require (`Need`), and the leaves `Beep` and `Hush`: not decided.
  return ["undecidable-action"];
};

// ── the corpus's reference values ────────────────────────────────────────

const HANDLERS = {
  // §4.1 — a handler with no stages is well-formed and conformant.
  "handler/minimal.json": handlerDoc("noop", []),

  // §4.5's worked example: read, compute, mutate, respond.
  "handler/read-compute-write.json": handlerDoc("orders.refresh", [
    effectStage(runQuery("orders", aNamedSource("orders"), [aLimit(50, 0)])),
    computeStage(aSetStateLiteral("status", "loaded")),
    effectStage(applyOps([aRemoveNode("orders-empty")])),
    effectStage(emitPatch([aRemoveNode("orders-spinner")])),
  ]),

  "handler/host-call.json": handlerDoc("invoice.settle", [
    computeStage(aSetStateLiteral("pending", true)),
    effectStage(hostCall("payments.settle", { amount: 1250, currency: "GBP" }, "settlement")),
    effectStage(notify("audit", { event: "settled" })),
  ]),

  "handler/nested-call.json": handlerDoc("chained", [
    computeStage(aChain([aSetStateLiteral("a", 1), aCall("/api/inner")])),
  ]),

  "handler/value-from.json": handlerDoc("orders.pick", [
    computeStage(aSetStateBound("chosen-id", aSelection("orders-grid", "id"))),
  ]),

  // §7.5 — one handler per defect token a document can exhibit, each holding
  // exactly that one. Isolation is the point: the corpus's older handler
  // vectors carry two tokens between them, and a pair sharing a grade is
  // invisible to an expectation that stops at `replaySafety`.

  "handler/host-call-only.json": handlerDoc("risk.check", [
    effectStage(hostCall("risk.score", { subject: "acct-91" }, undefined)),
  ]),

  "handler/notify-only.json": handlerDoc("audit.record", [effectStage(notify("audit", { event: "viewed" }))]),

  "handler/relative-op.json": handlerDoc("orders.reorder", [
    effectStage(applyOps([aReorderChildren("orders-list", ["ord-2", "ord-1"])])),
  ]),

  // Not `Call`, not `Chain`, not `SetState`: the walk's own list does not
  // reach it, so it is undecided rather than refused.
  "handler/undecidable-action.json": handlerDoc("orders.open", [computeStage(aNavigate("/orders/42"))]),
  // Classified under the `reaching` posture its vector declares (§7.4).
  "handler/staged-query.json": handlerDoc("orders.read", [effectStage(runQuery("orders", aNamedSource("orders"), []))]),

  // The recursion of §7.4, exercised: the chain's own classification is
  // nothing until its parts are read, and one of them is bound.
  "handler/chain-bound-write.json": handlerDoc("orders.stage", [
    computeStage(aChain([aSetStateLiteral("stage", "picking"), aSetStateBound("chosen-id", aSelection("orders-grid", "id"))])),
  ]),
  // A state-only document — effect stages alone — carrying a finding.
  "handler/state-only-report.json": handlerDoc("orders.archive", [
    effectStage(applyOps([aRemoveNode("orders-empty")])),
    effectStage(reportFinding("orders.archived", "info", "")),
  ]),
};

const SERVER_EFFECTS = {
  "server-effect/run-query.json": runQuery("orders", aNamedSource("orders"), [aLimit(50, 0)]),
  "server-effect/apply-ops.json": applyOps([aRemoveNode("orders-empty")]),
  "server-effect/host-call.json": hostCall("payments.settle", { amount: 1250, currency: "GBP" }, "settlement"),
  // No landing slot: the result is discarded, and the member is absent rather
  // than present-and-null.
  "server-effect/host-call-bare.json": hostCall("risk.score", { subject: "acct-91" }, undefined),
  "server-effect/emit-patch.json": emitPatch([aRemoveNode("orders-spinner")]),
  "server-effect/notify.json": notify("audit", { event: "settled" }),
  "server-effect/report.json": reportFinding("orders.stale", "warning", "3 orders are older than 30 days"),
  // The opaque payload is the one position whose key set this specification
  // leaves open, so it is where §2.3 has to be applied to keys the document
  // never declared. These three straddle the only boundary at which Ordinal
  // and code-point ordering disagree: a supplementary character's leading
  // UTF-16 unit is a high surrogate (below U+E000), so Ordinally it sorts
  // ahead of `ﬀ` while by code point it would sort behind it.
  "server-effect/notify-ordinal-divergence.json": notify("audit", {
    event: "settled",
    "\u{20000}": "supplementary",
    "ﬀ": "high-bmp",
  }),
};

// §5.2 — declaration order, `kind` discriminator. Modelled as ordered pairs
// because the order is the point; an object would leave it to a JSON writer.
const CLIENT_EFFECTS = {
  "client-effect/navigate.json": [
    ["kind", "Navigate"],
    ["route", "/orders"],
  ],
  // The arm's optional `target`, which §5.2 says is omitted at `Self`. Read
  // from the text alone: the member follows `route` because the Members column
  // lists it there, and it appears at all only because this vector's value is
  // not the identity.
  "client-effect/navigate-target.json": [
    ["kind", "Navigate"],
    ["route", "/docs/orders"],
    ["target", "Blank"],
  ],
  "client-effect/push-state.json": [
    ["kind", "PushState"],
    ["route", "/orders?page=2"],
  ],
  "client-effect/write-to-clipboard.json": [
    ["kind", "WriteToClipboard"],
    ["text", "ORD-4417"],
  ],
  "client-effect/focus.json": [
    ["kind", "Focus"],
    ["nodeId", "orders-search"],
  ],
  // The arm that pins the exception: `url` precedes `name`, which is not
  // Ordinal order.
  "client-effect/download.json": [
    ["kind", "Download"],
    ["url", "https://example.invalid/report.csv"],
    ["name", "report.csv"],
  ],
  "client-effect/read-file-body.json": [
    ["kind", "ReadFileBody"],
    ["nodeId", "upload-1"],
    ["encoding", "Text"],
  ],
  // The arm that pins the OTHER half of the exception: a tab, a carriage
  // return and a line feed, each of which §5.2 says this family spells short
  // where the canonical encoder spells it numerically. Without a vector
  // carrying one, that clause was a sentence both encoders could satisfy by
  // never being asked.
  "client-effect/control-characters.json": [
    ["kind", "WriteToClipboard"],
    ["text", "ORD-4417\tGBP 1250\r\nORD-4418\tGBP 900"],
  ],
  // Arm seven at format version 2. Read from §5.2 alone: the Members column is
  // empty, so the discriminator is the entire document. Nothing follows it
  // because there is nothing declared to follow it with.
  "client-effect/print.json": [["kind", "Print"]],
  // Arm eight. `prompt` precedes `token` because the Members column lists them
  // in that order, which §5.2 says IS the normative order for this family.
  "client-effect/confirm.json": [
    ["kind", "Confirm"],
    ["prompt", "Settle ORD-4417 for GBP 1250?"],
    ["token", "btn-settle#0"],
  ],
};

const INVOCATIONS = {
  // §8.3's worked example.
  "invocation/keyed.json": {
    $type: "Invocation",
    endpoint: "/api/settle",
    idempotencyKey: "a3f1c0e8-2b7d-4c11-9f6a-0d2e5b8c4417",
    nodeId: "btn-settle",
  },
  // The common case: no key asked for, and no member spelled null to say so.
  "invocation/unkeyed.json": {
    $type: "Invocation",
    endpoint: "/api/refresh",
    nodeId: "btn-refresh",
  },
};

const OUTCOMES = {
  // §6.3 — `performed` is EXECUTION order, so the staged host call trails a
  // capability declared after it.
  "outcome/committed.json": handlerReport(
    true,
    [],
    [{ channel: "audit", payload: { event: "settled" } }],
    [aRemoveNode("orders-spinner")],
    ["RunQuery", "Notify", "host:payments.settle"],
  ),

  // A plan-phase halt: the entry state throughout, and `performed` empty
  // because nothing reached the perform phase.
  "outcome/denied.json": handlerReport(
    false,
    [
      {
        $type: "Bounded",
        diagnostic: aBoundedDiagnostic("UnsupportedOnBoundedPath", { action: "AiTool", nodeId: "btn-settle" }),
      },
      { $type: "Denied", denial: { $type: "GateRefused", capability: "ApplyOps" } },
    ],
    [],
    [],
    [],
  ),

  // §6.4 — the one case an uncommitted outcome reports work performed, and
  // the `PerformFailed` that must accompany it.
  "outcome/perform-failed.json": handlerReport(
    false,
    [{ $type: "PerformFailed", capability: "host:payments.settle", reason: "the upstream declined the settlement" }],
    [],
    [],
    ["host:ledger.reserve"],
  ),

  // §6.5 — the memberless diagnostic. It carries no endpoint, and a member
  // would be refused.
  "outcome/unregistered.json": handlerReport(false, [{ $type: "HandlerUnregistered" }], [], [], []),
};

const CROSS_LAYER = {
  // §9.2 — one bounded reference under the namespaced slot, and nothing else.
  // `hash` is optional, and its absence here is the unpinned posture rather
  // than an omission from the model.
  "cross-layer/logic-tree-ref.json": {
    $type: "LogicTreeRef",
    ref: "orders-logic",
    slot: "fuaran.program/logic-tree",
  },

  // §9.2 — the same reference, content-addressed. The address is RECOMPUTED
  // from the preimage the text names rather than transcribed, so what the two
  // emitters triangulate is the rendering rule (the `sha256:` prefix and the
  // lower-case hex) and not a constant somebody copied. The member sorts
  // between `$type` and `ref` under §2.3, which is the other thing this vector
  // pins and neither emitter was told.
  "cross-layer/logic-tree-ref-pinned.json": {
    $type: "LogicTreeRef",
    hash: "sha256:" + digest("{}"),
    ref: "orders-logic",
    slot: "fuaran.program/logic-tree",
  },
};

// ── §10.7 · the toy subject ─────────────────────────────────────────────
//
// The toy's documents (§10.6) standing in every referenced position: its
// action in a compute stage, its `Relabel` in an `ops` or a `patches`, its
// `Sound` as the client effect. A read effect's source and pipeline are not
// the tree vocabulary's to begin with, so they are spelled as they are at the
// other subject.

const tRelabel = (target, label) => ({ $type: "Relabel", label, target });
const tRead = (key) => ({ $type: "Read", key });
const tHole = (placeholder) => ({ $type: "Hole", placeholder });
const tPutLiteral = (key, value) => ({ $type: "Put", key, value });
const tPutFrom = (key, from) => ({ $type: "Put", from, key });
const tSeq = (actions) => ({ $type: "Seq", actions });
// `targeted` is required and always written; a toy call declaring a target is
// refused by the fold (§10.6), so no vector here declares one.
const tRing = (endpoint) => ({ $type: "Ring", endpoint, targeted: false });
const tNeed = (condition) => ({ $type: "Need", condition });
const tPick = (entry, whenTrue, whenFalse) => ({ $type: "Pick", entry, whenFalse, whenTrue });
const tTimes = (bound, body) => ({ $type: "Times", body, bound });
const tParameter = (count, lo, hi) => ({ $type: "Parameter", count, hi, lo });
const tForEach = (collection, placeholder, body) => ({ $type: "ForEach", body, collection, placeholder });
const tBeep = (volume) => ({ $type: "Beep", volume });

const TOY_HANDLERS = {
  "toy-handler/minimal.json": handlerDoc("toy.noop", []),

  // §4.5's decomposition, at the toy subject.
  "toy-handler/read-compute-write.json": handlerDoc("title.refresh", [
    effectStage(runQuery("levels", aNamedSource("levels"), [aLimit(10, 0)])),
    computeStage(tPutLiteral("status", "loaded")),
    effectStage(applyOps([tRelabel("title", "Loaded")])),
    effectStage(emitPatch([tRelabel("footer", "Ready")])),
  ]),

  "toy-handler/host-call.json": handlerDoc("title.relabel", [
    computeStage(tPutLiteral("status", "relabelled")),
    effectStage(hostCall("audit", { note: "relabel" }, "receipt")),
    effectStage(notify("chimes", { event: "relabelled" })),
  ]),

  "toy-handler/nested-call.json": handlerDoc("chained", [
    computeStage(tSeq([tPutLiteral("a", 1), tRing("/handlers/relabel")])),
  ]),

  "toy-handler/value-from.json": handlerDoc("title.copy", [computeStage(tPutFrom("copied", tRead("draft")))]),

  // §7.5 — one per token a toy document can carry, each carrying it alone.
  "toy-handler/host-call-only.json": handlerDoc("ledger.audit", [
    effectStage(hostCall("audit", { note: "viewed" }, undefined)),
  ]),
  "toy-handler/notify-only.json": handlerDoc("chimes.ring", [effectStage(notify("chimes", { event: "viewed" }))]),
  "toy-handler/undecidable-action.json": handlerDoc("bell.ring", [computeStage(tBeep(2))]),
  "toy-handler/staged-query.json": handlerDoc("levels.read", [effectStage(runQuery("levels", aNamedSource("levels"), []))]),

  "toy-handler/seq-bound-write.json": handlerDoc("title.stage", [
    computeStage(tSeq([tPutLiteral("stage", "picking"), tPutFrom("copied", tRead("draft"))])),
  ]),

  // The four shapes only the toy views an action as.
  "toy-handler/guard.json": handlerDoc("title.guarded", [computeStage(tNeed(tRead("ready")))]),
  "toy-handler/choose.json": handlerDoc("title.choose", [
    computeStage(tPick(tRead("ready"), tPutLiteral("mode", "on"), tRing("/handlers/relabel"))),
  ]),
  "toy-handler/repeat-literal.json": handlerDoc("bell.repeat", [computeStage(tTimes(3, tPutLiteral("count", 1)))]),
  "toy-handler/repeat-parameter.json": handlerDoc("bell.repeat-n", [
    computeStage(tTimes(tParameter(tRead("n"), 0, 3), tPutLiteral("count", 1))),
  ]),
  "toy-handler/each-literal.json": handlerDoc("title.each", [
    computeStage(tForEach(["a", "b"], "item", tPutFrom("last", tHole("item")))),
  ]),
  "toy-handler/state-only-report.json": handlerDoc("title.archive", [
    effectStage(applyOps([tRelabel("title", "Archived")])),
    effectStage(reportFinding("title.archived", "info", "the title is archived")),
  ]),
};

const TOY_SERVER_EFFECTS = {
  "toy-server-effect/run-query.json": runQuery("levels", aNamedSource("levels"), [aLimit(10, 0)]),
  "toy-server-effect/apply-ops.json": applyOps([tRelabel("title", "Loaded")]),
  "toy-server-effect/host-call.json": hostCall("audit", { note: "relabel" }, "receipt"),
  // An empty opaque payload is still an object, and still `{}`.
  "toy-server-effect/host-call-bare.json": hostCall("decline", {}, undefined),
  "toy-server-effect/emit-patch.json": emitPatch([tRelabel("footer", "Ready")]),
  "toy-server-effect/notify.json": notify("chimes", { event: "relabelled" }),
  "toy-server-effect/report.json": reportFinding("bell.cracked", "problem", "the bell did not ring"),
  "toy-server-effect/notify-ordinal-divergence.json": notify("chimes", {
    event: "rang",
    "\u{20000}": "supplementary",
    "ﬀ": "high-bmp",
  }),
};

// §10.6 — `kind`, `nodeId`, `volume`: the emitter's order, which §5.2's
// envelope makes the normative one.
const TOY_CLIENT_EFFECTS = {
  "toy-client-effect/sound.json": [
    ["kind", "Sound"],
    ["nodeId", "bell"],
    ["volume", 3],
  ],
};

const TOY_OUTCOMES = {
  "toy-outcome/committed.json": handlerReport(
    true,
    [],
    [{ channel: "chimes", payload: { event: "relabelled" } }],
    [tRelabel("title", "Relabelled")],
    ["RunQuery", "Notify", "host:audit"],
  ),
  // No `Bounded` arm: §10.7 gives the toy no diagnostic vocabulary for it.
  "toy-outcome/denied.json": handlerReport(
    false,
    [{ $type: "Denied", denial: { $type: "GateRefused", capability: "ApplyOps" } }],
    [],
    [],
    [],
  ),
  "toy-outcome/perform-failed.json": handlerReport(
    false,
    [{ $type: "PerformFailed", capability: "host:decline", reason: "the host function declined" }],
    [],
    [],
    ["host:audit"],
  ),
  "toy-outcome/unregistered.json": handlerReport(false, [{ $type: "HandlerUnregistered" }], [], [], []),
};

// ── assembly ─────────────────────────────────────────────────────────────

const emit = () => {
  const out = {};
  for (const [file, model] of Object.entries(HANDLERS)) out[file] = encodeCanonical(model);
  for (const [file, model] of Object.entries(SERVER_EFFECTS)) out[file] = encodeCanonical(model);
  for (const [file, members] of Object.entries(CLIENT_EFFECTS)) out[file] = encodeClientEffect(members);
  for (const [file, model] of Object.entries(INVOCATIONS)) out[file] = encodeCanonical(model);
  for (const [file, model] of Object.entries(OUTCOMES)) out[file] = encodeCanonical(model);
  for (const [file, model] of Object.entries(CROSS_LAYER)) out[file] = encodeCanonical(model);
  for (const [file, model] of Object.entries(TOY_HANDLERS)) out[file] = encodeCanonical(model);
  for (const [file, model] of Object.entries(TOY_SERVER_EFFECTS)) out[file] = encodeCanonical(model);
  for (const [file, members] of Object.entries(TOY_CLIENT_EFFECTS)) out[file] = encodeClientEffect(members);
  for (const [file, model] of Object.entries(TOY_OUTCOMES)) out[file] = encodeCanonical(model);
  return out;
};

const emitted = emit();

// A machine-readable dump, so the two emitters can be byte-compared without
// either script importing the other. It prints and exits, and changes nothing
// about what is emitted.
if (process.argv.includes("--emit-json")) {
  process.stdout.write(JSON.stringify(emitted));
  process.exit(0);
}

if (process.argv.includes("--write")) {
  console.error("this emitter deliberately cannot write — see the header. Only the resident emitter mints bytes.");
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const failures = [];
let checked = 0;

for (const [file, document] of Object.entries(emitted)) {
  const committed = readFileSync(join(here, file), "utf8");
  checked += 1;

  if (committed === document) {
    console.log(`ok   ${file}`);
  } else {
    failures.push(file);
    console.error(`FAIL ${file}`);
    console.error(`  committed : ${committed}`);
    console.error(`  emitted   : ${document}`);
  }
}

// The manifest's digests must be reproducible from THIS emitter's bytes too,
// or the corpus and its own index disagree.
for (const [file, document] of Object.entries(emitted)) {
  const entry = manifest.vectors.find((v) => v.file === file);
  if (!entry) {
    failures.push(file);
    console.error(`FAIL ${file} is enumerated by no vector`);
    continue;
  }
  const got = digest(document);
  if (got !== entry.sha256) {
    failures.push(file);
    console.error(`FAIL ${file} digest ${got} != manifest ${entry.sha256}`);
  }
}

// §7.4 and §7.5, both recomputed independently from the models. The reasons
// are compared as a SEQUENCE — ordinal and token, in order — because §7.5
// makes the position part of the finding, and because a set comparison would
// accept a walk that attributed the right defect to the wrong stage.
const asText = (reasons) => (reasons ?? []).map((r) => `${r.stage}:${r.defect}`).join(",") || "(none)";

const CLASSIFIED = [
  ...Object.entries(HANDLERS).map(([file, model]) => ({ file, model, walk: actionDefects })),
  // A toy handler is classified by the toy's table (§10.7), never by §7.4's
  // spellings — every toy case would otherwise fall through to `undecidable`.
  ...Object.entries(TOY_HANDLERS).map(([file, model]) => ({ file, model, walk: toyDefects })),
];

for (const { file, model, walk } of CLASSIFIED) {
  const entry = manifest.vectors.find((v) => v.file === file);
  if (!entry) continue;

  const recomputed = replayClass(model, walk, entry.queryEvaluator);
  if (entry.replaySafety === recomputed) {
    console.log(`ok   ${file} replaySafety=${recomputed}`);
  } else {
    failures.push(file);
    console.error(`FAIL ${file} replaySafety ${recomputed} != manifest ${entry.replaySafety}`);
  }

  const reasons = replayReasonsOf(model, walk, entry.queryEvaluator);
  if (!Array.isArray(entry.replayReasons)) {
    failures.push(file);
    console.error(`FAIL ${file} replayReasons is absent; §7.5 makes it part of a handler vector's expectation`);
  } else if (asText(entry.replayReasons) === asText(reasons)) {
    console.log(`ok   ${file} replayReasons=${asText(reasons)}`);
  } else {
    failures.push(file);
    console.error(`FAIL ${file} replayReasons ${asText(reasons)} != manifest ${asText(entry.replayReasons)}`);
  }
}

// A harness that silently ran nothing reports the same green as one that
// passed everything (§10.1 point 6), so the count is asserted rather than
// assumed.
const roundTrips = manifest.vectors.filter((v) => v.kind === "round-trip").length;
if (checked !== roundTrips) {
  failures.push("vector count");
  console.error(`FAIL emitted ${checked} documents but the manifest enumerates ${roundTrips} round-trip vectors`);
}

if (failures.length) {
  console.error(`\n${failures.length} divergence(s) from the committed corpus.`);
  console.error("Read the text, not the emitters: a divergence here is first a question about");
  console.error("whether PROGRAM_WIRE.md determines these bytes at all.");
  process.exit(1);
}

console.log(`\n${checked} documents reproduced byte-identically by a second, independently written emitter.`);
