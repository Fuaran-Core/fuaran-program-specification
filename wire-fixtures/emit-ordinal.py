# SPDX-License-Identifier: Apache-2.0
#
# The third emitter for the program wire conformance corpus — written against
# PROGRAM_WIRE.md alone, in a language whose native string comparison is NOT
# the one §2.3 requires.
#
# ── Why a third emitter, and why this language ───────────────────────────
#
# The two emitters beside this one are both JavaScript on Node. That buys two
# readings of the text, and it is worth having. What it cannot buy is a test of
# any rule the shared runtime supplies for free: an accident both emitters
# inherit from their language is invisible to a comparison between them.
#
# §2.3's member ordering is exactly such a rule. JavaScript's `<` on strings
# compares UTF-16 code units, which IS Ordinal order, so neither emitter has to
# implement the rule on purpose — and one of them does not even try, sorting
# with a comparator whose whole body is `a < b ? -1 : a > b ? 1 : 0`. A corpus
# certified only by those two records that the rule was obeyed, never that it
# was understood.
#
# Python's native comparison orders strings by **code point**. That is not a
# worse ordering than Ordinal; it is a different one, and the difference is
# narrow and exact:
#
#     a supplementary character (U+10000 and above) encodes in UTF-16 as a
#     surrogate pair whose first unit lies in U+D800–U+DBFF, so under Ordinal
#     it sorts BELOW every character in U+E000–U+FFFF — while by code point it
#     sorts ABOVE all of them.
#
# So on this wire the two orderings agree everywhere except across that one
# boundary, which makes Python a sharper instrument than a culture-aware
# language would be: a culture-aware comparison diverges so widely that any
# vector at all would catch it, whereas this one diverges only where the
# specification's rule has actual content. Getting it right here requires
# implementing Ordinal deliberately — which is what `ordinal_key` below does,
# and what `--self-test` proves it does.
#
# The corpus vector `server-effect/notify-ordinal-divergence` is the vector
# that makes the difference observable rather than merely arguable. Sorting its
# payload keys natively produces different bytes; see run.ps1's self-test.
#
# Zero dependencies; the standard library only. No build step.
#
#   python emit-ordinal.py             # check against the committed corpus
#   python emit-ordinal.py --emit-json # dump {file: document} for the comparison
#   python emit-ordinal.py --self-test # unit-test the comparator alone
#
# This emitter deliberately does NOT write. Two emitters that can both rewrite
# the corpus can converge on each other's accidents; the resident emitter owns
# `--write` and these two only ever read.
#
# Scope, stated honestly per family — the same split the other two make:
#
#   handler / server-effect / invocation / outcome / cross-layer
#     Full independent derivation: envelopes, member presence, Ordinal member
#     ordering (§2.3), the omit-don't-null rule (§2.5), and the derived replay
#     classification of §7.4 with the reasons of §7.5, all recomputed from the
#     stage models rather than read off the manifest.
#
#   client-effect
#     Derived through a SEPARATE encoder, because §5.2's envelope predates this
#     specification: a `kind` discriminator, members in declaration order, and
#     the three short control escapes. Encoding it canonically would silently
#     erase the one enumerated exception the corpus exists to pin, so the two
#     encoders are two functions here and never one with a flag.
#
#   referenced positions (§3)
#     Modelled as plain values and encoded through the same ordinal encoder.
#     That derives their ORDERING and escaping independently; it does not
#     derive their SEMANTICS, which belong to the specifications §3 names.
#
#   the toy subject (§10.7)
#     The handler, server-effect, client-effect and outcome families again,
#     with the toy witness's vocabulary (§10.6) in the referenced positions.
#     A toy handler's replay classification is walked over the toy's cases by
#     §10.7's table — a walk of its own, not §7.4's applied to other tags.
#
# Reject vectors are not emitted: they are documents an implementation must
# REFUSE, so reproducing their bytes proves nothing.

import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# ── §2.3 · the Ordinal comparator, implemented rather than inherited ─────


def ordinal_key(s: str):
    """A sort key ordering strings by §2.3's Ordinal comparison.

    Ordinal is comparison of UTF-16 **code units**, numerically, unit by unit,
    as §2 rule 3 now states outright. This language compares strings by code
    point instead, so the rule has to be built here rather than borrowed.

    Encoding to UTF-16 big-endian and comparing the resulting BYTES is exactly
    that comparison: each code unit becomes two bytes, most significant first,
    so lexicographic byte order over the encoding reproduces numeric order over
    the units. Big-endian specifically, and without a byte-order mark — the
    little-endian encoding would compare the low half of each unit first and
    give a different answer, and a BOM would prefix every key with the same
    two bytes and quietly make the comparison a comparison of suffixes.

    The one place this differs from this language's own `<` is the surrogate
    range, and that is the whole point: see the module header, and `--self-test`.
    """
    return s.encode("utf-16-be")


def _self_test() -> int:
    """Unit-test the comparator against the cases it exists for.

    Run on every gate invocation, not only on demand: a comparator this small
    is exactly the kind of code that is quietly replaced by the language's own
    ordering during a tidy-up, and nothing else in this file would notice.
    """
    # The three characters this file exists for. They are written as literals
    # in UTF-8 source, so each carries its own identity in the comment beside
    # it: a reader cannot check a surrogate boundary against a glyph, and two
    # of these render as nothing at all in most fonts.
    supplementary = "𠀀"  # CJK Ext-B ideograph; UTF-16 D840 DC00
    high_bmp = "ﬀ"  # LATIN SMALL LIGATURE FF; UTF-16 FB00
    private_use = ""  # the floor of the divergence window
    ascii_key = "event"

    cases = [
        # (left, right, ordinal_says_left_is_first, description)
        (supplementary, high_bmp, True, "supplementary vs U+FB00 — the divergence"),
        (supplementary, private_use, True, "supplementary vs U+E000 — the window's floor"),
        (ascii_key, supplementary, True, "ASCII sorts below both orderings alike"),
        (ascii_key, high_bmp, True, "ASCII vs high BMP — the orderings agree"),
        ("$type", "channel", True, "§2.3's stated consequence: `$` precedes data keys"),
        ("a", "b", True, "the ordinary case, which must not regress"),
    ]

    failures = 0
    for left, right, expected, description in cases:
        got = ordinal_key(left) < ordinal_key(right)
        if got != expected:
            failures += 1
            print(f"FAIL comparator: {description}", file=sys.stderr)
            print(f"  expected {expected!r} for ordinal({left!r} < {right!r}), got {got!r}", file=sys.stderr)

    # The negative half, and the reason this file exists. The comparator must
    # DISAGREE with the language here — an implementation that merely delegated
    # to native comparison would pass every case above and fail these.
    divergences = [
        (supplementary, high_bmp),
        (supplementary, private_use),
    ]
    for left, right in divergences:
        native = left < right
        ordinal = ordinal_key(left) < ordinal_key(right)
        if native == ordinal:
            failures += 1
            print(
                f"FAIL comparator: {left!r} vs {right!r} was expected to expose the divergence, "
                f"and native comparison agreed with Ordinal ({native!r}) — "
                "either the comparator has been replaced by the language's own ordering, "
                "or these are no longer divergence cases",
                file=sys.stderr,
            )

    if failures:
        print(f"\n{failures} comparator failure(s) — §2.3 is not implemented here.", file=sys.stderr)
        return 1
    print(f"ok   the Ordinal comparator satisfies {len(cases)} cases and diverges from native comparison on {len(divergences)}")
    return 0


# ── §2 · canonical encoding ──────────────────────────────────────────────

# §2.7 — escape `"`, `\` and the control range U+0000–U+001F as `\u00xx` in
# lower-case hex, and nothing else. Notably no short escapes on this side.
def escape_canonical(s: str) -> str:
    out = []
    for ch in s:
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif ch < " ":
            out.append("\\u%04x" % ord(ch))
        else:
            # §2.1 — a non-ASCII character passes through as its literal UTF-8
            # sequence. There is no \uXXXX escaping of non-control characters,
            # which is why the divergence vector's keys appear as themselves.
            out.append(ch)
    return "".join(out)


# §5.2 — the same rule with the one difference that section states outright:
# this family's encoder spells the three common control characters with their
# short escapes. Implemented rather than assumed equal to the canonical one.
SHORT = {"\n": "\\n", "\r": "\\r", "\t": "\\t"}


def escape_as_emitted(s: str) -> str:
    out = []
    for ch in s:
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif ch in SHORT:
            out.append(SHORT[ch])
        elif ch < " ":
            out.append("\\u%04x" % ord(ch))
        else:
            out.append(ch)
    return "".join(out)


def render_number(n) -> str:
    """§2.8 — an integer renders without a fractional part."""
    if isinstance(n, bool):  # a bool is an int in this language; never here
        raise ValueError("a boolean is not a number on this wire")
    if isinstance(n, int):
        return str(n)
    if n != n or n in (float("inf"), float("-inf")):
        raise ValueError(f"{n} has no rendering on this wire (§2.8)")
    if n == int(n):
        return str(int(n))
    return repr(n)


# `None` marks an absent optional member and is DROPPED (§2.5). There is no
# path through this function that emits the token `null`, which is how the rule
# is enforced rather than remembered.
#
# The recursion reaches every object at every depth, opaque payload positions
# included — a payload this specification declines to decompose is still a JSON
# object on this wire, and §2's rules are properties of the wire (§2.3).
def encode_canonical(value, esc=escape_canonical) -> str:
    if value is None:
        raise ValueError("this wire carries no null (§2.5)")
    if isinstance(value, str):
        return '"' + esc(value) + '"'
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return render_number(value)
    if isinstance(value, list):
        return "[" + ",".join(encode_canonical(v, esc) for v in value) + "]"
    if isinstance(value, dict):
        keys = [k for k in value if value[k] is not None]
        keys.sort(key=ordinal_key)  # §2.3 — the rule, deliberately applied
        return "{" + ",".join('"' + esc(k) + '":' + encode_canonical(value[k], esc) for k in keys) + "}"
    raise ValueError(f"{type(value).__name__} has no rendering on this wire")


# §5.2's enumerated exception, in its own function so the exception is a fact
# about this file rather than a comment in it: members in DECLARATION order —
# the order §5.2's table lists them, `kind` first — and the as-emitted escaping.
def encode_client_effect(members) -> str:
    return (
        "{"
        + ",".join(
            '"' + escape_as_emitted(k) + '":' + encode_canonical(v, escape_as_emitted) for k, v in members
        )
        + "}"
    )


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ── §3 · referenced positions ────────────────────────────────────────────
# Modelled, not quoted: the ordinal encoder derives their bytes.


def a_remove_node(target):
    return {"$type": "RemoveNode", "target": target}


def a_reorder_children(parent_id, new_order):
    return {"$type": "ReorderChildren", "newOrder": new_order, "parentId": parent_id}


def a_set_state(key, value):
    return {"$type": "SetState", "key": key, "value": value}


def a_set_state_from(key, value_from):
    return {"$type": "SetState", "key": key, "valueFrom": value_from}


def a_selection(node_id, field):
    return {"$type": "Selection", "field": field, "nodeId": node_id}


def a_call(endpoint):
    return {"$type": "Call", "endpoint": endpoint}


def a_chain(ops):
    return {"$type": "Chain", "ops": ops}


def a_navigate(route):
    return {"$type": "Navigate", "route": route}


def a_named_source(name):
    return {"ref": name, "schema": []}


def a_limit(n, offset):
    return {"$type": "limit", "n": n, "offset": offset}


# ── the model vocabulary ─────────────────────────────────────────────────


def compute(action):
    return {"$type": "Compute", "action": action}


def effect(e):
    return {"$type": "Effect", "effect": e}


def run_query(name, source, pipeline):
    return {"$type": "RunQuery", "name": name, "pipeline": pipeline, "source": source}


def apply_ops(ops):
    return {"$type": "ApplyOps", "ops": ops}


def host_call(fn, args, into):
    return {"$type": "HostCall", "args": args, "fn": fn, "into": into}


def emit_patch(ops):
    return {"$type": "EmitPatch", "ops": ops}


def notify(channel, payload):
    return {"$type": "Notify", "channel": channel, "payload": payload}


def handler(name, stages):
    return {"$type": "Handler", "name": name, "stages": stages}


# ── §7.4 / §7.5 · the derived replay classification, re-derived ──────────
#
# The REASONS are the primitive and the classification derives from them, which
# is what §7.5 requires: a host holding two independent walks holds two copies
# of one rule, and a reason that disagrees with the verdict it explains is read
# as the explanation of it.

RANK = {"safe": 0, "unknown": 1, "unsafe": 2}

# §7.5 — the grade each token of the closed defect vocabulary forces.
GRADE = {
    "opaque-host-call": "unsafe",
    "outbound-notification": "unsafe",
    # §7.4 — a read under the `reaching` posture a vector declares.
    "staged-query": "unsafe",
    "relative-addressing": "unknown",
    "non-literal-write": "unknown",
    "undecidable-action": "unknown",
    # Reachable only from a value a host built itself — never from a document,
    # so no vector carries it. Present because the table is closed.
    "unencodable-op": "unknown",
}


def worst(a, b):
    return a if RANK[a] >= RANK[b] else b


def distinct(xs):
    out = []
    for x in xs:
        if x not in out:
            out.append(x)
    return out


def op_defects(op):
    """An op is provably re-runnable when it addresses a target absolutely."""
    target = op.get("target")
    return [] if isinstance(target, str) and target else ["relative-addressing"]


def action_defects(action):
    kind = action["$type"]
    if kind == "Call":
        # A call inside a stage is inert (§4.2), so re-running it changes nothing.
        return []
    if kind == "Chain":
        return distinct([d for op in action["ops"] for d in action_defects(op)])
    if kind == "SetState":
        # A literal write is re-runnable; a write whose value comes from a
        # binding is resolved against a store that has moved.
        return [] if action.get("valueFrom") is None else ["non-literal-write"]
    return ["undecidable-action"]


def effect_defects(e, query=None):
    """`query` is the host posture the vector declares (§7.4): an input to the
    walk, never read off the document. Only `reaching` makes a read a reach."""
    kind = e["$type"]
    if kind == "RunQuery":
        return ["staged-query"] if query == "reaching" else []
    if kind in ("ApplyOps", "EmitPatch"):
        return [d for op in e["ops"] for d in op_defects(op)]
    if kind == "HostCall":
        return ["opaque-host-call"]
    if kind == "Notify":
        return ["outbound-notification"]
    return ["undecidable-action"]


def toy_action_defects(action):
    """§10.7 — the toy subject's walk, one branch per row of its table. The
    toy's cases are the algebra's shapes (§10.6), and the shape decides."""
    kind = action["$type"]
    if kind == "Ring":
        # The toy's call: inert inside a stage (§4.2).
        return []
    if kind == "Seq":
        return distinct([d for a in action["actions"] for d in toy_action_defects(a)])
    if kind == "Put":
        # `from` is resolved at dispatch whatever expression it holds; a
        # literal `value` re-runs as written.
        return ["non-literal-write"] if action.get("from") is not None else []
    if kind == "Pick":
        # The entry is resolved at dispatch, and either arm may be the one
        # that re-runs, so both are read.
        return distinct(
            ["undecidable-action"] + toy_action_defects(action["whenTrue"]) + toy_action_defects(action["whenFalse"])
        )
    if kind == "Times":
        bound = action["bound"]
        body = toy_action_defects(action["body"])
        # A literal bound is a bare integer; `bool` is excluded because this
        # language counts it as one.
        if isinstance(bound, int) and not isinstance(bound, bool):
            return body
        return distinct(["undecidable-action"] + body)
    if kind == "ForEach":
        # Once per element; substituting an element for a `Hole` changes no
        # case, and an empty collection runs the body never.
        return distinct([d for _ in action["collection"] for d in toy_action_defects(action["body"])])
    # `Need`, `Beep`, `Hush`.
    return ["undecidable-action"]


def replay_reasons(h, walk=action_defects, query=None):
    """§7.5 — reasons in stage order, DISTINCT within a stage and never merged
    across stages: nine relatively-addressed ops in one effect are one fact
    about that stage, and two stages carrying the same defect are two places to
    go and look."""
    out = []
    for stage, s in enumerate(h["stages"]):
        defects = distinct(walk(s["action"]) if s["$type"] == "Compute" else effect_defects(s["effect"], query))
        for defect in defects:
            out.append({"stage": stage, "defect": defect})
    return out


def replay_safety(h, walk=action_defects, query=None):
    verdict = "safe"
    for r in replay_reasons(h, walk, query):
        verdict = worst(verdict, GRADE[r["defect"]])
    return verdict


# ── the documents ────────────────────────────────────────────────────────

HANDLERS = {
    "handler/minimal.json": handler("noop", []),
    "handler/read-compute-write.json": handler(
        "orders.refresh",
        [
            effect(run_query("orders", a_named_source("orders"), [a_limit(50, 0)])),
            compute(a_set_state("status", "loaded")),
            effect(apply_ops([a_remove_node("orders-empty")])),
            effect(emit_patch([a_remove_node("orders-spinner")])),
        ],
    ),
    "handler/host-call.json": handler(
        "invoice.settle",
        [
            compute(a_set_state("pending", True)),
            effect(host_call("payments.settle", {"amount": 1250, "currency": "GBP"}, "settlement")),
            effect(notify("audit", {"event": "settled"})),
        ],
    ),
    "handler/nested-call.json": handler(
        "chained", [compute(a_chain([a_set_state("a", 1), a_call("/api/inner")]))]
    ),
    "handler/value-from.json": handler(
        "orders.pick", [compute(a_set_state_from("chosen-id", a_selection("orders-grid", "id")))]
    ),
    # §7.5 — one vector per defect token a DOCUMENT can exhibit, each ISOLATING
    # its token so the reason set discriminates the arm and not merely its
    # grade: `relative-addressing` and `non-literal-write` both grade
    # `unknown`, and `opaque-host-call` and `outbound-notification` both grade
    # `unsafe`, so a reader confusing either pair would pass a corpus pinning
    # only `replaySafety`.
    "handler/host-call-only.json": handler(
        "risk.check", [effect(host_call("risk.score", {"subject": "acct-91"}, None))]
    ),
    "handler/notify-only.json": handler("audit.record", [effect(notify("audit", {"event": "viewed"}))]),
    "handler/relative-op.json": handler(
        "orders.reorder", [effect(apply_ops([a_reorder_children("orders-list", ["ord-2", "ord-1"])]))]
    ),
    "handler/undecidable-action.json": handler("orders.open", [compute(a_navigate("/orders/42"))]),
    # Classified under the `reaching` posture its vector declares (§7.4).
    "handler/staged-query.json": handler("orders.read", [effect(run_query("orders", a_named_source("orders"), []))]),
    "handler/chain-bound-write.json": handler(
        "orders.stage",
        [
            compute(
                a_chain(
                    [
                        a_set_state("stage", "picking"),
                        a_set_state_from("chosen-id", a_selection("orders-grid", "id")),
                    ]
                )
            )
        ],
    ),
}

SERVER_EFFECTS = {
    "server-effect/run-query.json": run_query("orders", a_named_source("orders"), [a_limit(50, 0)]),
    "server-effect/apply-ops.json": apply_ops([a_remove_node("orders-empty")]),
    "server-effect/host-call.json": host_call("payments.settle", {"amount": 1250, "currency": "GBP"}, "settlement"),
    "server-effect/host-call-bare.json": host_call("risk.score", {"subject": "acct-91"}, None),
    "server-effect/emit-patch.json": emit_patch([a_remove_node("orders-spinner")]),
    "server-effect/notify.json": notify("audit", {"event": "settled"}),
    # §2.3's ordering rule, at the one position this specification leaves the
    # key set OPEN. An opaque payload's members are domain-supplied, so this is
    # where the rule has to be applied to keys nobody enumerated in advance —
    # and these three straddle the only boundary at which Ordinal and code-point
    # ordering disagree. Emitted Ordinally the supplementary key precedes the
    # BMP one, because its first UTF-16 unit is a high surrogate (U+D840) and
    # therefore below U+FB00; sorted by code point it would follow it.
    "server-effect/notify-ordinal-divergence.json": notify(
        "audit",
        {
            "event": "settled",
            "\U00020000": "supplementary",
            "ﬀ": "high-bmp",
        },
    ),
}

# §5.2 — declaration order, `kind` discriminator.
CLIENT_EFFECTS = {
    "client-effect/navigate.json": [("kind", "Navigate"), ("route", "/orders")],
    # The optional `target` of Section 5.2, omitted at its identity `Self`, so
    # "Blank" is the only value that reaches the wire.
    "client-effect/navigate-target.json": [
        ("kind", "Navigate"),
        ("route", "/docs/orders"),
        ("target", "Blank"),
    ],
    "client-effect/push-state.json": [("kind", "PushState"), ("route", "/orders?page=2")],
    "client-effect/write-to-clipboard.json": [("kind", "WriteToClipboard"), ("text", "ORD-4417")],
    "client-effect/focus.json": [("kind", "Focus"), ("nodeId", "orders-search")],
    "client-effect/download.json": [
        ("kind", "Download"),
        ("url", "https://example.invalid/report.csv"),
        ("name", "report.csv"),
    ],
    "client-effect/read-file-body.json": [("kind", "ReadFileBody"), ("nodeId", "upload-1"), ("encoding", "Text")],
    "client-effect/control-characters.json": [
        ("kind", "WriteToClipboard"),
        ("text", "ORD-4417\tGBP 1250\r\nORD-4418\tGBP 900"),
    ],
    # Arm seven at format version 2 — no members, so the discriminator is the
    # whole document.
    "client-effect/print.json": [("kind", "Print")],
    # Arm eight. Declaration order, which for this family is the order Section
    # 5.2's Members column lists: prompt, then token.
    "client-effect/confirm.json": [
        ("kind", "Confirm"),
        ("prompt", "Settle ORD-4417 for GBP 1250?"),
        ("token", "btn-settle#0"),
    ],
}

INVOCATIONS = {
    "invocation/keyed.json": {
        "$type": "Invocation",
        "endpoint": "/api/settle",
        "idempotencyKey": "a3f1c0e8-2b7d-4c11-9f6a-0d2e5b8c4417",
        "nodeId": "btn-settle",
    },
    "invocation/unkeyed.json": {
        "$type": "Invocation",
        "endpoint": "/api/refresh",
        "nodeId": "btn-refresh",
    },
}


def report(committed, diagnostics, notifications, patches, performed):
    return {
        "$type": "HandlerReport",
        "committed": committed,
        "diagnostics": diagnostics,
        "notifications": notifications,
        "patches": patches,
        "performed": performed,
    }


OUTCOMES = {
    # A committed run: `performed` is the plan phase's capabilities in stage
    # order, then the host calls the perform phase ran — EXECUTION order (§6.3),
    # which is why `host:` trails a capability declared after it.
    "outcome/committed.json": report(
        True,
        [],
        [{"channel": "audit", "payload": {"event": "settled"}}],
        [a_remove_node("orders-spinner")],
        ["RunQuery", "Notify", "host:payments.settle"],
    ),
    # A plan-phase halt: everything is the entry state and `performed` is empty,
    # because nothing ever reached the perform phase.
    "outcome/denied.json": report(
        False,
        [
            {
                "$type": "Bounded",
                "diagnostic": {"$type": "UnsupportedOnBoundedPath", "action": "AiTool", "nodeId": "btn-settle"},
            },
            {"$type": "Denied", "denial": {"$type": "GateRefused", "capability": "ApplyOps"}},
        ],
        [],
        [],
        [],
    ),
    # The one case an uncommitted outcome reports work performed (§6.4).
    "outcome/perform-failed.json": report(
        False,
        [
            {
                "$type": "PerformFailed",
                "capability": "host:payments.settle",
                "reason": "the upstream declined the settlement",
            }
        ],
        [],
        [],
        ["host:ledger.reserve"],
    ),
    # The memberless diagnostic: it deliberately does not say which endpoint.
    "outcome/unregistered.json": report(False, [{"$type": "HandlerUnregistered"}], [], [], []),
}

CROSS_LAYER = {
    # The unpinned reference: `hash` is optional and its absence is the posture
    # every reference took before the member existed.
    "cross-layer/logic-tree-ref.json": {
        "$type": "LogicTreeRef",
        "ref": "orders-logic",
        "slot": "fuaran.program/logic-tree",
    },
    # The pinned reference. The address is RECOMPUTED from the preimage §9.2
    # names rather than written out as a constant, so the vector pins the
    # rendering rule and the member's Ordinal position between `$type` and `ref`.
    "cross-layer/logic-tree-ref-pinned.json": {
        "$type": "LogicTreeRef",
        "hash": "sha256:" + digest("{}"),
        "ref": "orders-logic",
        "slot": "fuaran.program/logic-tree",
    },
}


# ── §10.7 · the toy subject ──────────────────────────────────────────────
# The toy witness's own vocabulary (§10.6) in every referenced position.


def t_relabel(target, label):
    return {"$type": "Relabel", "label": label, "target": target}


def t_read(key):
    return {"$type": "Read", "key": key}


def t_hole(placeholder):
    return {"$type": "Hole", "placeholder": placeholder}


def t_put(key, value):
    return {"$type": "Put", "key": key, "value": value}


def t_put_from(key, source):
    return {"$type": "Put", "from": source, "key": key}


def t_seq(actions):
    return {"$type": "Seq", "actions": actions}


def t_ring(endpoint):
    return {"$type": "Ring", "endpoint": endpoint, "targeted": False}


def t_need(condition):
    return {"$type": "Need", "condition": condition}


def t_pick(entry, when_true, when_false):
    return {"$type": "Pick", "entry": entry, "whenFalse": when_false, "whenTrue": when_true}


def t_times(bound, body):
    return {"$type": "Times", "body": body, "bound": bound}


def t_parameter(count, lo, hi):
    return {"$type": "Parameter", "count": count, "hi": hi, "lo": lo}


def t_for_each(collection, placeholder, body):
    return {"$type": "ForEach", "body": body, "collection": collection, "placeholder": placeholder}


def t_beep(volume):
    return {"$type": "Beep", "volume": volume}


TOY_HANDLERS = {
    "toy-handler/minimal.json": handler("toy.noop", []),
    "toy-handler/read-compute-write.json": handler(
        "title.refresh",
        [
            effect(run_query("levels", a_named_source("levels"), [a_limit(10, 0)])),
            compute(t_put("status", "loaded")),
            effect(apply_ops([t_relabel("title", "Loaded")])),
            effect(emit_patch([t_relabel("footer", "Ready")])),
        ],
    ),
    "toy-handler/host-call.json": handler(
        "title.relabel",
        [
            compute(t_put("status", "relabelled")),
            effect(host_call("audit", {"note": "relabel"}, "receipt")),
            effect(notify("chimes", {"event": "relabelled"})),
        ],
    ),
    "toy-handler/nested-call.json": handler(
        "chained", [compute(t_seq([t_put("a", 1), t_ring("/handlers/relabel")]))]
    ),
    "toy-handler/value-from.json": handler("title.copy", [compute(t_put_from("copied", t_read("draft")))]),
    # §7.5 — one vector per token a toy document can carry, each alone.
    "toy-handler/host-call-only.json": handler("ledger.audit", [effect(host_call("audit", {"note": "viewed"}, None))]),
    "toy-handler/notify-only.json": handler("chimes.ring", [effect(notify("chimes", {"event": "viewed"}))]),
    "toy-handler/undecidable-action.json": handler("bell.ring", [compute(t_beep(2))]),
    "toy-handler/staged-query.json": handler("levels.read", [effect(run_query("levels", a_named_source("levels"), []))]),
    "toy-handler/seq-bound-write.json": handler(
        "title.stage", [compute(t_seq([t_put("stage", "picking"), t_put_from("copied", t_read("draft"))]))]
    ),
    # The shapes the referenced vocabulary never views an action as (§10.6).
    "toy-handler/guard.json": handler("title.guarded", [compute(t_need(t_read("ready")))]),
    "toy-handler/choose.json": handler(
        "title.choose", [compute(t_pick(t_read("ready"), t_put("mode", "on"), t_ring("/handlers/relabel")))]
    ),
    "toy-handler/repeat-literal.json": handler("bell.repeat", [compute(t_times(3, t_put("count", 1)))]),
    "toy-handler/repeat-parameter.json": handler(
        "bell.repeat-n", [compute(t_times(t_parameter(t_read("n"), 0, 3), t_put("count", 1)))]
    ),
    "toy-handler/each-literal.json": handler(
        "title.each", [compute(t_for_each(["a", "b"], "item", t_put_from("last", t_hole("item"))))]
    ),
}

TOY_SERVER_EFFECTS = {
    "toy-server-effect/run-query.json": run_query("levels", a_named_source("levels"), [a_limit(10, 0)]),
    "toy-server-effect/apply-ops.json": apply_ops([t_relabel("title", "Loaded")]),
    "toy-server-effect/host-call.json": host_call("audit", {"note": "relabel"}, "receipt"),
    "toy-server-effect/host-call-bare.json": host_call("decline", {}, None),
    "toy-server-effect/emit-patch.json": emit_patch([t_relabel("footer", "Ready")]),
    "toy-server-effect/notify.json": notify("chimes", {"event": "relabelled"}),
    # §2.3 at the open payload position, at this subject too: the supplementary
    # key precedes `ﬀ` Ordinally and would follow it by code point.
    "toy-server-effect/notify-ordinal-divergence.json": notify(
        "chimes",
        {
            "event": "rang",
            "\U00020000": "supplementary",
            "ﬀ": "high-bmp",
        },
    ),
}

# §10.6 — `kind`, `nodeId`, `volume`, in that order: §5.2's envelope.
TOY_CLIENT_EFFECTS = {
    "toy-client-effect/sound.json": [("kind", "Sound"), ("nodeId", "bell"), ("volume", 3)],
}

TOY_OUTCOMES = {
    "toy-outcome/committed.json": report(
        True,
        [],
        [{"channel": "chimes", "payload": {"event": "relabelled"}}],
        [t_relabel("title", "Relabelled")],
        ["RunQuery", "Notify", "host:audit"],
    ),
    # No `Bounded` arm: the toy has no diagnostic vocabulary for it (§10.7).
    "toy-outcome/denied.json": report(
        False,
        [{"$type": "Denied", "denial": {"$type": "GateRefused", "capability": "ApplyOps"}}],
        [],
        [],
        [],
    ),
    "toy-outcome/perform-failed.json": report(
        False,
        [{"$type": "PerformFailed", "capability": "host:decline", "reason": "the host function declined"}],
        [],
        [],
        ["host:audit"],
    ),
    "toy-outcome/unregistered.json": report(False, [{"$type": "HandlerUnregistered"}], [], [], []),
}


# ── assembly ─────────────────────────────────────────────────────────────


def documents():
    out = {}
    for table in (
        HANDLERS,
        SERVER_EFFECTS,
        INVOCATIONS,
        OUTCOMES,
        CROSS_LAYER,
        TOY_HANDLERS,
        TOY_SERVER_EFFECTS,
        TOY_OUTCOMES,
    ):
        for file, model in table.items():
            out[file] = encode_canonical(model)
    for table in (CLIENT_EFFECTS, TOY_CLIENT_EFFECTS):
        for file, members in table.items():
            out[file] = encode_client_effect(members)
    return out


def main() -> int:
    args = sys.argv[1:]

    if "--self-test" in args:
        return _self_test()

    emitted = documents()

    if "--emit-json" in args:
        # A machine-readable dump so the comparison can byte-compare this
        # emitter against the other two without any of them importing another.
        sys.stdout.write(json.dumps(emitted))
        return 0

    # The comparator is unit-tested on every ordinary run, not only on demand.
    # Its correctness is the premise of every document below.
    if _self_test() != 0:
        return 1

    manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
    by_file = {v["file"]: v for v in manifest["vectors"]}

    failures = 0
    checked = 0

    for file, document in emitted.items():
        path = HERE / file
        committed = path.read_text(encoding="utf-8")
        checked += 1
        if committed != document:
            failures += 1
            print(f"FAIL {file}", file=sys.stderr)
            print(f"  committed: {committed}", file=sys.stderr)
            print(f"  emitted  : {document}", file=sys.stderr)
        else:
            print(f"ok   {file}")

    # The digests the manifest records must be reproducible from THIS emitter's
    # bytes, otherwise the corpus and its own index disagree.
    for file, document in emitted.items():
        entry = by_file.get(file)
        if entry is None:
            failures += 1
            print(f"FAIL {file} is enumerated by no vector", file=sys.stderr)
            continue
        got = digest(document)
        if got != entry["sha256"]:
            failures += 1
            print(f"FAIL {file} digest {got} != manifest {entry['sha256']}", file=sys.stderr)

    # §7.4 / §7.5 — every handler vector's declared classification AND its
    # reasons, both recomputed from the model. A derived value nobody re-derives
    # is a constant with a longer name. The reasons are the finer of the two and
    # are checked separately rather than folded into the verdict: two defects of
    # one grade produce one verdict, so a comparison stopping at the value would
    # accept a walk that had confused them.
    def reasons_text(reasons):
        return ",".join(f"{r['stage']}:{r['defect']}" for r in reasons) or "(none)"

    # Each subject's handlers through its own walk (§7.4 for the referenced
    # vocabulary, §10.7's table for the toy).
    classified = [(f, m, action_defects) for f, m in HANDLERS.items()] + [
        (f, m, toy_action_defects) for f, m in TOY_HANDLERS.items()
    ]

    for file, model, walk in classified:
        entry = by_file.get(file)
        if entry is None:
            continue
        # The host posture is an input the vector declares, never derived.
        recomputed = replay_safety(model, walk, entry.get("queryEvaluator"))
        reasons = replay_reasons(model, walk, entry.get("queryEvaluator"))
        if entry.get("replaySafety") != recomputed:
            failures += 1
            print(
                f"FAIL {file} replaySafety {recomputed} != manifest {entry.get('replaySafety')}",
                file=sys.stderr,
            )
        else:
            print(f"ok   {file} replaySafety={recomputed}")

        declared = entry.get("replayReasons")
        if not isinstance(declared, list):
            failures += 1
            print(
                f"FAIL {file} replayReasons is absent; a handler round-trip vector declares them (§7.5)",
                file=sys.stderr,
            )
        elif reasons_text(declared) != reasons_text(reasons):
            failures += 1
            print(
                f"FAIL {file} replayReasons {reasons_text(reasons)} != manifest {reasons_text(declared)}",
                file=sys.stderr,
            )
        else:
            print(f"ok   {file} replayReasons={reasons_text(reasons)}")

    if failures:
        print(f"\n{failures} failure(s) reproducing the corpus from the text.", file=sys.stderr)
        return 1
    if checked == 0:
        print("no documents were checked", file=sys.stderr)
        return 1
    print(f"\n{checked} documents reproduced byte-identically by the ordinal emitter.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
