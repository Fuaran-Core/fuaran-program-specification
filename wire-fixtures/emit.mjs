// SPDX-License-Identifier: Apache-2.0
//
// The resident emitter for the program wire conformance corpus — written
// against PROGRAM_WIRE.md alone, in a language and runtime other than the
// reference host's.
//
// Its job is triangulation, not coverage. One emitter cannot tell its own
// accidents from the format: whatever it does becomes "the format" simply
// because it is the only thing producing bytes. So this script holds the
// same reference VALUES as unstamped models, applies the ordering and
// encoding rules as the specification states them, and compares its output
// byte-for-byte against the committed fixtures. A divergence is a
// specification bug by definition — either the text failed to state a rule,
// or it stated one the reference host does not follow.
//
// It is not the only one. `emit-independent.mjs` beside it derives the same
// documents from the same text in a second, separately written pass, and
// `compare-emitters.mjs` byte-compares the two. Where they disagree the
// finding is about the TEXT — it failed to determine something one of them
// decided — and the remedy is in the text, never in whichever emitter looks
// wrong. This is the emitter that WRITES; the other deliberately cannot.
//
// Zero dependencies; Node's own crypto and fs only. No build step.
//
//   node emit.mjs             # check against the committed corpus
//   node emit.mjs --write     # rewrite the round-trip documents + digests
//   node emit.mjs --emit-json # dump {file: document} for the comparison
//
// Scope, stated honestly per family:
//
//   handler / server-effect / invocation / outcome / cross-layer
//     Full independent derivation of everything PROGRAM_WIRE.md specifies:
//     the envelopes, member presence, Ordinal member ordering (§2.3), the
//     omit-don't-null rule (§2.5), and the derived replay classification of
//     §7.4 together with the reasons of §7.5 — all recomputed here from the
//     stage models rather than read off the manifest, because a derivation
//     nobody re-derives is a constant with a longer name.
//
//   client-effect
//     Derived through a DIFFERENT encoder, deliberately: §5.2's envelope
//     predates the specification and orders its members by declaration
//     rather than Ordinally. Encoding it with the ordinal encoder would
//     silently "fix" the exception the corpus exists to pin, so the two
//     encoders are separate functions here and the exception is a fact
//     about the code rather than a note in a comment.
//
//   referenced positions (§3)
//     Actions, tree-ops, sources and pipelines are modelled as plain values
//     and encoded through the SAME ordinal encoder. That derives their
//     ORDERING and escaping independently; it does not derive their
//     SEMANTICS, which belong to the specifications §3 names and are
//     certified against their own corpora.
//
//   the toy subject (§10.7)
//     The same document families with the toy witness's vocabulary (§10.6)
//     in the referenced positions. The toy IS owned by the specification,
//     so here the emitter derives more than ordering: the replay
//     classification of a toy handler is walked over the toy's own cases, by
//     the table §10.7 gives, and never borrowed from the walk above.
//
// Reject vectors are not emitted: they are documents an implementation must
// REFUSE, so reproducing their bytes proves nothing. Certify against them by
// feeding each to your own reader and requiring the refusal class the
// manifest names.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// ── canonical encoding (§2) ──────────────────────────────────────────

/** §2.7 — escape `"`, `\` and the control range, and nothing else. */
const escape = (s) => {
  let out = "";
  for (const ch of s) {
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch < " ") out += "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
    else out += ch;
  }
  return out;
};

/**
 * §5.2 — the same rule with the one difference that section states outright:
 * the client-effect family's encoder spells the three common control
 * characters with their short escapes rather than as `\u00xx`, so a document
 * carrying one differs from what the canonical encoder would produce. It is
 * implemented rather than assumed equal, because an encoder silently
 * canonical here would be one more way to erase the exception the family
 * exists to pin — and `client-effect/control-characters.json` now carries all
 * three, so the rule is held by bytes rather than by this comment.
 */
const SHORT = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };
const escapeAsEmitted = (s) => {
  let out = "";
  for (const ch of s) {
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (SHORT[ch]) out += SHORT[ch];
    else if (ch < " ") out += "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
    else out += ch;
  }
  return out;
};

const str = (s) => '"' + escape(s) + '"';
const strAsEmitted = (s) => '"' + escapeAsEmitted(s) + '"';
const num = (n) => String(n);
const bool = (b) => (b ? "true" : "false");

/**
 * §2.3 — object members ordered by Ordinal comparison of their keys, and
 * §2.5 — a member whose value is `undefined` is OMITTED, never nulled. There
 * is no path in this encoder that can emit the token `null`, which is how
 * the rule is enforced rather than remembered.
 */
const enc = (value) => {
  if (value === null || value === undefined) throw new Error("the wire has no null (§2.5)");
  if (typeof value === "string") return str(value);
  if (typeof value === "boolean") return bool(value);
  if (typeof value === "number") return num(value);
  if (Array.isArray(value)) return "[" + value.map(enc).join(",") + "]";

  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + keys.map((k) => str(k) + ":" + enc(value[k])).join(",") + "}";
};

/**
 * §5.2's enumerated exception: members in DECLARATION order, discriminator
 * member `kind`. A separate function on purpose — see the header.
 */
const encDeclared = (pairs) =>
  "{" +
  pairs.map(([k, v]) => strAsEmitted(k) + ":" + (typeof v === "string" ? strAsEmitted(v) : enc(v))).join(",") +
  "}";

const sha256Hex = (text) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

// ── referenced values (§3) ───────────────────────────────────────────
// Modelled, not quoted: the ordinal encoder derives their bytes.

const removeNode = (target) => ({ $type: "RemoveNode", target });
// An op that addresses by POSITION within a parent's children rather than by
// naming a node: the shape §7.4 contrasts an absolute address with.
const reorderChildren = (parentId, newOrder) => ({ $type: "ReorderChildren", newOrder, parentId });
const setState = (key, value) => ({ $type: "SetState", key, value });
const setStateFrom = (key, valueFrom) => ({ $type: "SetState", key, valueFrom });
const selection = (nodeId, field) => ({ $type: "Selection", field, nodeId });
const call = (endpoint) => ({ $type: "Call", endpoint });
const chain = (ops) => ({ $type: "Chain", ops });
const navigate = (route) => ({ $type: "Navigate", route });
const refSource = (name) => ({ ref: name, schema: [] });
const limit = (n, offset) => ({ $type: "limit", n, offset });

// ── the model vocabulary ─────────────────────────────────────────────

const compute = (action) => ({ $type: "Compute", action });
const effect = (e) => ({ $type: "Effect", effect: e });

const runQuery = (name, source, pipeline) => ({ $type: "RunQuery", name, pipeline, source });
const applyOps = (ops) => ({ $type: "ApplyOps", ops });
const hostCall = (fn, args, into) => ({ $type: "HostCall", args, fn, into });
const emitPatch = (ops) => ({ $type: "EmitPatch", ops });
const notify = (channel, payload) => ({ $type: "Notify", channel, payload });

const handler = (name, stages) => ({ $type: "Handler", name, stages });

// ── §7.4 / §7.5 — the derived replay classification, re-derived ──────
//
// The REASONS are the primitive and the classification is derived from
// them, which is what §7.5 requires and not merely a convenient ordering:
// a host holding two independent walks holds two copies of one rule, and a
// reason that disagrees with the verdict it explains is read as the
// explanation of it.
//
// `unsafe` dominates `unknown`, which dominates `safe`: a handler's
// classification is the strongest claim its weakest stage permits.

const RANK = { safe: 0, unknown: 1, unsafe: 2 };
const worst = (a, b) => (RANK[a] >= RANK[b] ? a : b);

/** §7.5 — the grade each token of the closed defect vocabulary forces. */
const GRADE = {
  "opaque-host-call": "unsafe",
  "outbound-notification": "unsafe",
  "relative-addressing": "unknown",
  "non-literal-write": "unknown",
  "undecidable-action": "unknown",
  // Reachable only from a value a host built itself — never from a document,
  // so no vector carries it. Present here because the table is closed.
  "unencodable-op": "unknown",
};

const distinct = (xs) => xs.filter((x, i) => xs.indexOf(x) === i);

/** An op is provably re-runnable when it addresses a target absolutely. */
const opDefects = (op) =>
  typeof op.target === "string" && op.target.length > 0 ? [] : ["relative-addressing"];

const actionDefects = (action) => {
  switch (action.$type) {
    // A call inside a stage is inert (§4.2), so re-running it changes nothing.
    case "Call":
      return [];
    case "Chain":
      return distinct(action.ops.flatMap(actionDefects));
    case "SetState":
      // A literal write is re-runnable; a write whose value comes from a
      // binding is resolved against a store that has moved.
      return action.valueFrom === undefined ? [] : ["non-literal-write"];
    default:
      return ["undecidable-action"];
  }
};

const effectDefects = (e) => {
  switch (e.$type) {
    case "RunQuery":
      return [];
    case "ApplyOps":
    case "EmitPatch":
      return e.ops.flatMap(opDefects);
    case "HostCall":
      return ["opaque-host-call"];
    case "Notify":
      return ["outbound-notification"];
    default:
      return ["undecidable-action"];
  }
};

/**
 * §7.5 — reasons in stage order, DISTINCT within a stage and never merged
 * across stages: nine relatively-addressed ops in one effect are one fact
 * about that stage, and two stages carrying the same defect are two places
 * to go and look.
 */
const replayReasons = (h, walk = actionDefects) =>
  h.stages.flatMap((s, stage) =>
    distinct(s.$type === "Compute" ? walk(s.action) : effectDefects(s.effect)).map((defect) => ({
      stage,
      defect,
    })),
  );

const replaySafety = (h, walk = actionDefects) =>
  replayReasons(h, walk).reduce((acc, r) => worst(acc, GRADE[r.defect]), "safe");

// ── §10.7 — the toy subject's action walk ────────────────────────────
//
// The toy's cases are the algebra's shapes (§10.6), and §10.7 tabulates what
// each contributes. Two of them are why the table exists rather than §7.4's
// list being reused by name: a repeat over a LITERAL bound and an iteration
// over a literal collection re-run their bodies and nothing else, so they are
// as re-runnable as those bodies — §7.4 never had a repeat or an iteration to
// say that about.

const toyActionDefects = (action) => {
  switch (action.$type) {
    // The toy's call: inert inside a stage (§4.2), exactly as `Call` is.
    case "Ring":
      return [];
    case "Seq":
      return distinct(action.actions.flatMap(toyActionDefects));
    // A write carrying `from` is resolved at dispatch, whatever `from` holds.
    case "Put":
      return action.from === undefined ? [] : ["non-literal-write"];
    // Which arm re-runs is decided against a store that has moved — and either
    // arm may be the one, so both are read.
    case "Pick":
      return distinct([
        "undecidable-action",
        ...toyActionDefects(action.whenTrue),
        ...toyActionDefects(action.whenFalse),
      ]);
    case "Times":
      return typeof action.bound === "number"
        ? toyActionDefects(action.body)
        : distinct(["undecidable-action", ...toyActionDefects(action.body)]);
    // Once per element, the element substituted for a `Hole` — which changes
    // no case, so each element contributes the body's defects, and an empty
    // collection contributes none.
    case "ForEach":
      return action.collection.length === 0 ? [] : toyActionDefects(action.body);
    // `Need` (a guard), and the two leaves `Beep` and `Hush`.
    default:
      return ["undecidable-action"];
  }
};

// ── the documents ────────────────────────────────────────────────────

const handlers = {
  "handler/minimal.json": handler("noop", []),

  "handler/read-compute-write.json": handler("orders.refresh", [
    effect(runQuery("orders", refSource("orders"), [limit(50, 0)])),
    compute(setState("status", "loaded")),
    effect(applyOps([removeNode("orders-empty")])),
    effect(emitPatch([removeNode("orders-spinner")])),
  ]),

  "handler/host-call.json": handler("invoice.settle", [
    compute(setState("pending", true)),
    effect(hostCall("payments.settle", { amount: 1250, currency: "GBP" }, "settlement")),
    effect(notify("audit", { event: "settled" })),
  ]),

  "handler/nested-call.json": handler("chained", [
    compute(chain([setState("a", 1), call("/api/inner")])),
  ]),

  "handler/value-from.json": handler("orders.pick", [
    compute(setStateFrom("chosen-id", selection("orders-grid", "id"))),
  ]),

  // ── §7.5 · one vector per defect token a DOCUMENT can exhibit ──────
  //
  // Each ISOLATES its token, so the reason set discriminates the arm and
  // not merely its grade: `relative-addressing` and `non-literal-write`
  // both grade `unknown`, and `opaque-host-call` and
  // `outbound-notification` both grade `unsafe`, so a reader that confused
  // either pair would pass a corpus pinning only `replaySafety`.

  "handler/host-call-only.json": handler("risk.check", [
    effect(hostCall("risk.score", { subject: "acct-91" }, undefined)),
  ]),

  "handler/notify-only.json": handler("audit.record", [effect(notify("audit", { event: "viewed" }))]),

  // An op addressing a position within a parent's children rather than
  // naming a node — the contrast §7.4 draws when it says "absolutely
  // addressed".
  "handler/relative-op.json": handler("orders.reorder", [
    effect(applyOps([reorderChildren("orders-list", ["ord-2", "ord-1"])])),
  ]),

  // An action arm the walk does not decide. It is well-formed and its
  // classification is `unknown` rather than a refusal: §7.4 reports what it
  // cannot decide, and rounding it either way would be a guess.
  "handler/undecidable-action.json": handler("orders.open", [compute(navigate("/orders/42"))]),

  // §7.4's recursion, exercised: a chain composing a literal write AND a
  // binding-valued one. A reader taking "a chain" unconditionally — the
  // reading the clause exists to exclude — classifies this `safe`, and the
  // offending write is one level down from the stage the walk reports on,
  // which is what makes it the hard case rather than merely another one.
  "handler/chain-bound-write.json": handler("orders.stage", [
    compute(chain([setState("stage", "picking"), setStateFrom("chosen-id", selection("orders-grid", "id"))])),
  ]),
};

const serverEffects = {
  "server-effect/run-query.json": runQuery("orders", refSource("orders"), [limit(50, 0)]),
  "server-effect/apply-ops.json": applyOps([removeNode("orders-empty")]),
  "server-effect/host-call.json": hostCall("payments.settle", { amount: 1250, currency: "GBP" }, "settlement"),
  "server-effect/host-call-bare.json": hostCall("risk.score", { subject: "acct-91" }, undefined),
  "server-effect/emit-patch.json": emitPatch([removeNode("orders-spinner")]),
  "server-effect/notify.json": notify("audit", { event: "settled" }),

  // §2.3's ordering rule at the one position this specification leaves the key
  // set OPEN. An opaque payload's members are domain-supplied, so this is the
  // only place the rule must be applied to keys nobody enumerated in advance —
  // and these straddle the single boundary at which Ordinal and code-point
  // ordering disagree. `\u{20000}` encodes in UTF-16 as the surrogate pair
  // D840 DC00, so Ordinally it precedes `ﬀ`; by code point it would
  // follow it. This emitter gets the order for free, because `<` on JavaScript
  // strings compares UTF-16 code units — which is exactly why the corpus needs
  // a third emitter in a language where it is not free (`emit-ordinal.py`).
  "server-effect/notify-ordinal-divergence.json": notify("audit", {
    event: "settled",
    "\u{20000}": "supplementary",
    "ﬀ": "high-bmp",
  }),
};

// §5.2 — declaration order, `kind` discriminator.
const clientEffects = {
  "client-effect/navigate.json": [
    ["kind", "Navigate"],
    ["route", "/orders"],
  ],
  // §5.2's omit-at-identity rule, held by BYTES on both sides: the vector
  // above carries no `target` and means `Self`, and this one is the only
  // spelling that ever puts the member on the wire. A pair, because a single
  // vector could be reproduced by an encoder that always emits the member and
  // a single vector could be reproduced by one that never does.
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
  // §5.2's short-escape rule, fixed by BYTES rather than by text alone. The
  // rule was implemented in both encoders and exercised by no vector, which
  // is the shape in which a rule quietly stops holding: nothing would have
  // gone red had an encoder written a tab out numerically instead of with
  // its short escape, because the corpus never carried one to write out.
  "client-effect/control-characters.json": [
    ["kind", "WriteToClipboard"],
    ["text", "ORD-4417\tGBP 1250\r\nORD-4418\tGBP 900"],
  ],
  // Format version 2, arm seven. The only document in this corpus whose
  // discriminator is the WHOLE of it — which is exactly what makes it worth a
  // vector: an encoder that appends members it thinks helpful, and a decoder
  // that tolerates them, both pass every other client-effect vector.
  "client-effect/print.json": [["kind", "Print"]],
  // Format version 2, arm eight. Two required members in declaration order.
  // `token` addresses the confirmation inside the originating gesture; the
  // continuations are deliberately not here, and no member of this document
  // says what a yes will do.
  "client-effect/confirm.json": [
    ["kind", "Confirm"],
    ["prompt", "Settle ORD-4417 for GBP 1250?"],
    ["token", "btn-settle#0"],
  ],
};

const invocations = {
  "invocation/keyed.json": {
    $type: "Invocation",
    endpoint: "/api/settle",
    idempotencyKey: "a3f1c0e8-2b7d-4c11-9f6a-0d2e5b8c4417",
    nodeId: "btn-settle",
  },
  "invocation/unkeyed.json": {
    $type: "Invocation",
    endpoint: "/api/refresh",
    nodeId: "btn-refresh",
  },
};

const report = (o) => ({
  $type: "HandlerReport",
  committed: o.committed,
  diagnostics: o.diagnostics,
  notifications: o.notifications,
  patches: o.patches,
  performed: o.performed,
});

const outcomes = {
  // A committed run: `performed` is the plan phase's capabilities in stage
  // order, then the host calls the perform phase ran — EXECUTION order (§6.3),
  // which is why `host:` trails a capability declared after it.
  "outcome/committed.json": report({
    committed: true,
    diagnostics: [],
    notifications: [{ channel: "audit", payload: { event: "settled" } }],
    patches: [removeNode("orders-spinner")],
    performed: ["RunQuery", "Notify", "host:payments.settle"],
  }),

  // A plan-phase halt: everything is the entry state and `performed` is empty,
  // because nothing ever reached the perform phase.
  "outcome/denied.json": report({
    committed: false,
    diagnostics: [
      { $type: "Bounded", diagnostic: { $type: "UnsupportedOnBoundedPath", action: "AiTool", nodeId: "btn-settle" } },
      { $type: "Denied", denial: { $type: "GateRefused", capability: "ApplyOps" } },
    ],
    notifications: [],
    patches: [],
    performed: [],
  }),

  // The one case an uncommitted outcome reports work performed (§6.4).
  "outcome/perform-failed.json": report({
    committed: false,
    diagnostics: [
      { $type: "PerformFailed", capability: "host:payments.settle", reason: "the upstream declined the settlement" },
    ],
    notifications: [],
    patches: [],
    performed: ["host:ledger.reserve"],
  }),

  // The memberless diagnostic: it deliberately does not say which endpoint.
  "outcome/unregistered.json": report({
    committed: false,
    diagnostics: [{ $type: "HandlerUnregistered" }],
    notifications: [],
    patches: [],
    performed: [],
  }),
};

const crossLayer = {
  // The unpinned reference: `hash` is optional and its absence is the posture
  // every reference took before the member existed.
  "cross-layer/logic-tree-ref.json": {
    $type: "LogicTreeRef",
    ref: "orders-logic",
    slot: "fuaran.program/logic-tree",
  },

  // The pinned reference. The address is RECOMPUTED from the preimage §9.2
  // names — a document that governs nothing, chosen so the example cannot
  // smuggle an ungoverned shape into the text by illustration — rather than
  // written out as a constant. What the vector pins is the rendering rule and
  // the member's Ordinal position between `$type` and `ref`.
  "cross-layer/logic-tree-ref-pinned.json": {
    $type: "LogicTreeRef",
    hash: "sha256:" + sha256Hex("{}"),
    ref: "orders-logic",
    slot: "fuaran.program/logic-tree",
  },
};

// ── the toy subject (§10.7) ──────────────────────────────────────────
// The toy witness's vocabulary (§10.6) in the referenced positions. It is
// owned here, so these models are the documents' whole content rather than a
// stand-in for another specification's values.

const relabel = (target, label) => ({ $type: "Relabel", label, target });
const read = (key) => ({ $type: "Read", key });
const hole = (placeholder) => ({ $type: "Hole", placeholder });
const put = (key, value) => ({ $type: "Put", key, value });
const putFrom = (key, from) => ({ $type: "Put", from, key });
const seq = (actions) => ({ $type: "Seq", actions });
const ring = (endpoint) => ({ $type: "Ring", endpoint, targeted: false });
const need = (condition) => ({ $type: "Need", condition });
const pick = (entry, whenTrue, whenFalse) => ({ $type: "Pick", entry, whenFalse, whenTrue });
const times = (bound, body) => ({ $type: "Times", body, bound });
const parameter = (count, lo, hi) => ({ $type: "Parameter", count, hi, lo });
const forEach = (collection, placeholder, body) => ({ $type: "ForEach", body, collection, placeholder });
const beep = (volume) => ({ $type: "Beep", volume });

const toyHandlers = {
  // The empty handler again, because a toy-subject host runs none of the
  // referenced subject's vectors and would otherwise never meet it.
  "toy-handler/minimal.json": handler("toy.noop", []),

  "toy-handler/read-compute-write.json": handler("title.refresh", [
    effect(runQuery("levels", refSource("levels"), [limit(10, 0)])),
    compute(put("status", "loaded")),
    effect(applyOps([relabel("title", "Loaded")])),
    effect(emitPatch([relabel("footer", "Ready")])),
  ]),

  "toy-handler/host-call.json": handler("title.relabel", [
    compute(put("status", "relabelled")),
    effect(hostCall("audit", { note: "relabel" }, "receipt")),
    effect(notify("chimes", { event: "relabelled" })),
  ]),

  // A call nested in a sequence: inert in a stage, so the stage is as
  // re-runnable as the literal write beside it.
  "toy-handler/nested-call.json": handler("chained", [compute(seq([put("a", 1), ring("/handlers/relabel")]))]),

  "toy-handler/value-from.json": handler("title.copy", [compute(putFrom("copied", read("draft")))]),

  // §7.5 — one vector per token a toy document can exhibit, each isolating it.
  "toy-handler/host-call-only.json": handler("ledger.audit", [effect(hostCall("audit", { note: "viewed" }, undefined))]),
  "toy-handler/notify-only.json": handler("chimes.ring", [effect(notify("chimes", { event: "viewed" }))]),
  "toy-handler/undecidable-action.json": handler("bell.ring", [compute(beep(2))]),

  // §7.4's recursion, through the toy's sequence: the bound write is one
  // level below the stage the walk reports on.
  "toy-handler/seq-bound-write.json": handler("title.stage", [
    compute(seq([put("stage", "picking"), putFrom("copied", read("draft"))])),
  ]),

  // The shapes the referenced vocabulary never views an action as (§10.6).
  "toy-handler/guard.json": handler("title.guarded", [compute(need(read("ready")))]),
  "toy-handler/choose.json": handler("title.choose", [
    compute(pick(read("ready"), put("mode", "on"), ring("/handlers/relabel"))),
  ]),
  "toy-handler/repeat-literal.json": handler("bell.repeat", [compute(times(3, put("count", 1)))]),
  "toy-handler/repeat-parameter.json": handler("bell.repeat-n", [
    compute(times(parameter(read("n"), 0, 3), put("count", 1))),
  ]),
  "toy-handler/each-literal.json": handler("title.each", [
    compute(forEach(["a", "b"], "item", putFrom("last", hole("item")))),
  ]),
};

const toyServerEffects = {
  "toy-server-effect/run-query.json": runQuery("levels", refSource("levels"), [limit(10, 0)]),
  "toy-server-effect/apply-ops.json": applyOps([relabel("title", "Loaded")]),
  "toy-server-effect/host-call.json": hostCall("audit", { note: "relabel" }, "receipt"),
  "toy-server-effect/host-call-bare.json": hostCall("decline", {}, undefined),
  "toy-server-effect/emit-patch.json": emitPatch([relabel("footer", "Ready")]),
  "toy-server-effect/notify.json": notify("chimes", { event: "relabelled" }),
  // §2.3 at the open payload position, as the referenced subject's vector
  // pins it: the rule is the encoder's, and a toy-subject host has an encoder.
  "toy-server-effect/notify-ordinal-divergence.json": notify("chimes", {
    event: "rang",
    "\u{20000}": "supplementary",
    "ﬀ": "high-bmp",
  }),
};

// §10.6 — the toy's one effect, in §5.2's envelope: `kind`, then the members
// in the emitter's order.
const toyClientEffects = {
  "toy-client-effect/sound.json": [
    ["kind", "Sound"],
    ["nodeId", "bell"],
    ["volume", 3],
  ],
};

const toyOutcomes = {
  "toy-outcome/committed.json": report({
    committed: true,
    diagnostics: [],
    notifications: [{ channel: "chimes", payload: { event: "relabelled" } }],
    patches: [relabel("title", "Relabelled")],
    performed: ["RunQuery", "Notify", "host:audit"],
  }),

  // A plan-phase halt with no `Bounded` diagnostic: the toy specifies no
  // diagnostic vocabulary for that referenced position (§10.7).
  "toy-outcome/denied.json": report({
    committed: false,
    diagnostics: [{ $type: "Denied", denial: { $type: "GateRefused", capability: "ApplyOps" } }],
    notifications: [],
    patches: [],
    performed: [],
  }),

  "toy-outcome/perform-failed.json": report({
    committed: false,
    diagnostics: [{ $type: "PerformFailed", capability: "host:decline", reason: "the host function declined" }],
    notifications: [],
    patches: [],
    performed: ["host:audit"],
  }),

  "toy-outcome/unregistered.json": report({
    committed: false,
    diagnostics: [{ $type: "HandlerUnregistered" }],
    notifications: [],
    patches: [],
    performed: [],
  }),
};

// ── assembly ─────────────────────────────────────────────────────────

const documents = () => {
  const out = {};
  for (const [file, model] of Object.entries(handlers)) out[file] = enc(model);
  for (const [file, model] of Object.entries(serverEffects)) out[file] = enc(model);
  for (const [file, pairs] of Object.entries(clientEffects)) out[file] = encDeclared(pairs);
  for (const [file, model] of Object.entries(invocations)) out[file] = enc(model);
  for (const [file, model] of Object.entries(outcomes)) out[file] = enc(model);
  for (const [file, model] of Object.entries(crossLayer)) out[file] = enc(model);
  for (const [file, model] of Object.entries(toyHandlers)) out[file] = enc(model);
  for (const [file, model] of Object.entries(toyServerEffects)) out[file] = enc(model);
  for (const [file, pairs] of Object.entries(toyClientEffects)) out[file] = encDeclared(pairs);
  for (const [file, model] of Object.entries(toyOutcomes)) out[file] = enc(model);
  return out;
};

const write = process.argv.includes("--write");
const manifestPath = join(here, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const emitted = documents();

// A machine-readable dump, so the second emitter can be byte-compared against
// this one without either script importing the other. It prints and exits, and
// changes nothing about what is emitted.
if (process.argv.includes("--emit-json")) {
  process.stdout.write(JSON.stringify(emitted));
  process.exit(0);
}

let failures = 0;
let checked = 0;

for (const [file, document] of Object.entries(emitted)) {
  const path = join(here, file);

  if (write) {
    writeFileSync(path, document, "utf8");
    continue;
  }

  const committed = readFileSync(path, "utf8");
  checked += 1;

  if (committed !== document) {
    failures += 1;
    console.error(`FAIL ${file}`);
    console.error(`  committed: ${committed}`);
    console.error(`  emitted  : ${document}`);
  } else {
    console.log(`ok   ${file}`);
  }
}

// The digests the manifest records must be reproducible from THIS emitter's
// bytes, otherwise the corpus and its own index disagree.
for (const [file, document] of Object.entries(emitted)) {
  const entry = manifest.vectors.find((v) => v.file === file);
  if (!entry) {
    failures += 1;
    console.error(`FAIL ${file} is enumerated by no vector`);
    continue;
  }
  if (write) {
    entry.sha256 = sha256Hex(document);
  } else if (sha256Hex(document) !== entry.sha256) {
    failures += 1;
    console.error(`FAIL ${file} digest ${sha256Hex(document)} != manifest ${entry.sha256}`);
  }
}

// §7.4 / §7.5 — every handler vector's declared classification AND its
// reasons, both recomputed from the model. A derived value nobody re-derives
// is a constant with a longer name.
//
// The reasons are the finer of the two and are checked separately rather than
// folded into the verdict: two defects of one grade produce one verdict, so a
// comparison that stopped at the value would accept a walk that had confused
// them.
const reasonsText = (reasons) => reasons.map((r) => `${r.stage}:${r.defect}`).join(",") || "(none)";

// Each subject's handlers through that subject's own action walk: a toy
// handler classified by the referenced subject's walk would read every toy
// case as undecidable and get most of them wrong.
const classified = [
  ...Object.entries(handlers).map(([file, model]) => [file, model, actionDefects]),
  ...Object.entries(toyHandlers).map(([file, model]) => [file, model, toyActionDefects]),
];

for (const [file, model, walk] of classified) {
  const entry = manifest.vectors.find((v) => v.file === file);
  const recomputed = replaySafety(model, walk);
  const reasons = replayReasons(model, walk);
  if (!entry) continue;
  if (write) {
    entry.replaySafety = recomputed;
    entry.replayReasons = reasons;
    continue;
  }
  if (entry.replaySafety !== recomputed) {
    failures += 1;
    console.error(`FAIL ${file} replaySafety ${recomputed} != manifest ${entry.replaySafety}`);
  } else {
    console.log(`ok   ${file} replaySafety=${recomputed}`);
  }

  const declared = entry.replayReasons;
  if (!Array.isArray(declared)) {
    failures += 1;
    console.error(`FAIL ${file} replayReasons is absent; a handler round-trip vector declares them (§7.5)`);
  } else if (reasonsText(declared) !== reasonsText(reasons)) {
    failures += 1;
    console.error(`FAIL ${file} replayReasons ${reasonsText(reasons)} != manifest ${reasonsText(declared)}`);
  } else {
    console.log(`ok   ${file} replayReasons=${reasonsText(reasons)}`);
  }
}

if (write) {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`wrote ${Object.keys(emitted).length} documents and refreshed the manifest's derived fields`);
} else if (failures > 0) {
  console.error(`\n${failures} divergence(s) between the two emitters — that is a specification bug.`);
  process.exit(1);
} else if (checked === 0) {
  console.error("no documents were checked");
  process.exit(1);
} else {
  console.log(`\n${checked} documents reproduced byte-identically by the resident emitter.`);
}
