# Program wire specification

A wire specification for **behaviour carried as data**: a bounded, total algebra of sequencing,
typed branching and named effects, which a host can read, check and refuse **before** it runs any of
it. It specifies what a host-registered handler declares, what such a handler may ask of the host it
runs in and of the surface it renders to, what one run of it produced, how a replay is meant to
behave, and how the layers name one another across a boundary neither side has a type dependency on.

Three artefacts, and they move together or not at all:

- **[`PROGRAM_WIRE.md`](PROGRAM_WIRE.md)** — the normative text. §1–§11 and Appendix A name no
  implementation, no product and no language.
- **[`schemas/v2/`](schemas/v2/)** — structural, and deliberately **subordinate** to the text. A
  schema can say a member is a string; it cannot say that a capability is derived rather than
  carried, that an audit trail is in execution order, or that an uncommitted outcome reporting work
  performed must carry a perform-phase failure. Where the two disagree, the text wins.
- **[`wire-fixtures/`](wire-fixtures/)** — the executable conformance corpus, carrying two kinds of
  family: **shape families** of wire documents, and **driver-semantics** scenarios that pin what the
  loop *does* rather than what a document *is*. [`manifest.json`](wire-fixtures/manifest.json) is the
  authoritative enumeration of both; do not count either from a prose description of the corpus,
  including this one.

## What is actually decided here

A specification is most useful where it closes a question rather than describing a shape. Five are
closed here, and each says what it forecloses:

| | |
|---|---|
| **Host-effect atomicity** | Two-phase staging (§6). A handler run plans in full — gating, resolving and slot-checking every host call without invoking one — and performs only if the plan completed. A domain failure therefore happens before anything external runs. The residual it moves but cannot abolish is **reported, never absorbed**: a perform-phase failure names exactly the calls that did run. |
| **Replay** | Two modes, **named** (§7). `audit-replay` reconstructs what a session did and is effect-free unconditionally; `resume-replay` re-derives reads against current data and may re-run nothing else. They are not interchangeable, and a host says which it is in. A handler's replay safety is **derived from its declared form**, never declared beside it. |
| **Idempotency** | The key rides the **invocation**, is **optional**, and **exactly-once is forgone and said so** (§8). What a key buys is at-most-once *admission*: a recorded outcome is returned rather than a second run planned. It cannot ride the program, because a program is untrusted; it cannot be mandatory, because a mandatory key would still not buy exactly-once. |
| **Result-target ownership** | The **handler** declares where its own results land, and a program-declared target is **refused** rather than ignored (§9.5). Ignoring it would leave an author believing an answer lands somewhere it never does, and would leave a retired mechanism looking alive to anyone reading the vocabulary. |
| **What conformance requires of an effect** | That it is **reached**, not what it does (§5.5). Recognition is normative; *performance* is host-defined, so a surface that satisfies a navigation differently is conformant; and *refusal* is conformant too, because both vocabularies default to deny — but it must be reported as a denial carrying the derived capability, because a silently-dropped effect and a performed one are indistinguishable in the outcome document. What this forecloses is advertising a conformance claim as a claim about behaviour at a surface. |

## Certifying an implementation

Codec conformance is **whole-corpus**. Every shape family is a facet of one thing — a host that runs
handlers necessarily reaches all six — so partitioning it would produce claims nobody needs.

1. **Round-trip** every `round-trip` vector: decode, re-encode, bytes identical.
2. **Refuse** every `reject` vector, **for the class the manifest names**. A refusal for some other
   reason is not a pass.
3. **Reproduce** every derived value a vector declares — today, the `replaySafety` on each handler
   vector and the `replayReasons` beside it, both recomputed from the decoded document rather than
   read off the manifest, under the host query posture the vector names in `queryEvaluator` (§7.4).
   The reasons discriminate *within* a grade, which the value cannot.
4. **Implement §6, §7.2 and §8.2**, which are obligations on behaviour rather than on bytes and are
   the reason this is a specification of a *loop* and not merely of a document set.

Then assert two things about your own harness, without which a green result means nothing: that the
number of vectors you ran equals the number the manifest enumerates, and that a mutated fixture makes
you go red. [`wire-fixtures/README.md`](wire-fixtures/README.md) gives the procedure in full.

**The driver-semantics family is the one thing here that is opt-in** (§10.2). It asserts what the
loop *does*, step by step, so it applies only to a host that has declared it implements the bounded
path — a host that decodes, records, relays or validates these documents is **out of scope** for it,
which is a different verdict from failing it and is kept different on purpose. A claim over that
family names both halves or it is not well formed: *this implementation implements the bounded path,
and it reproduces the driver-semantics family*.

## Verifying this repository

```
pwsh ./run.ps1
```

Two standard libraries only; no build step, no package manager, nothing to install beyond Node and a
Python 3 interpreter (`PYTHON` names it where the usual spellings do not resolve). It
runs **three** emitters against the committed bytes, then the three against **each other**; checks the
manifest still describes the tree it sits in — a question no emitter can answer, since each only ever
reads vectors the manifest already lists; checks the driver-semantics scenarios still have the shape
§10.3 gives them, which none of the others can see; and then proves each check goes red **for the
perturbation it was handed**, against a scratch copy.

The extra emitters are the leg worth explaining. All three are dependency-free and written from
[`PROGRAM_WIRE.md`](PROGRAM_WIRE.md) alone, separately and not from one another, and only the
resident one may write bytes. A rule this specification leaves open is a rule a *single* emitter can
never fail: it closes the rule its own way, and the fixtures it mints then pin that choice as though
the text had made it. Emitters disagreeing says the text never decided — which makes it a defect
in the **specification**, to be fixed there and not in whichever emitter looks wrong.

The **third** emitter answers a question a second one in the same runtime cannot. Two readings in one
language still share whatever that language supplies for free, and §2's rule 3 — members ordered by
Ordinal, that is by UTF-16 code unit — is supplied for free in JavaScript, where `<` on strings
already compares exactly those units. Neither JavaScript emitter has to get that rule right on
purpose. [`emit-ordinal.py`](wire-fixtures/emit-ordinal.py) is written in a language that orders
strings by **code point** instead, so it has to build the comparison deliberately and unit-test it;
and `server-effect/notify-ordinal-divergence` is the vector that makes the difference observable,
carrying keys that straddle the single boundary at which the two orderings disagree. Sorting that
document's members natively yields different bytes, and the gate proves it does.

## Neutrality

**2026-10-04, fuaran#2013.** This specification is moving to a neutral substrate organisation, and a
repository there references no private project, product, repository or workspace artefact of the
organisations it serves. Its tree and history were swept against that rule before the move.

**The pattern set** is one case-insensitive extended regular expression in five classes: private
repository, product and organisation-internal names; the maintainers' planning-command names and
workspace tooling; workspace instruction and planning-document file names; framing that implies a
private ecosystem around this repository, and the vocabulary of the coordination layer that consumes
it; and the planning engine's name anywhere but a bare citation. Its allow-list admits the copyright
line and `NOTICE`'s attribution, bare phase citations, this repository's current organisation slug,
and the Unicode term "Basic Multilingual Plane". The literal set names the private things it looks
for, so it is held on the maintainers' private side, as a two-line file (the pattern, then the
allow-list, each LF-terminated) whose SHA-256 is
`e94be5417fdfb713d2d2ea99e22c90227b99d78c99f23fe1194e1dbac836f193`. It re-runs from the repository
root as:

```powershell
$banned, $allowed = Get-Content <the recorded pattern file>
git grep -n -I -i -E $banned | Select-String -NotMatch -Pattern $allowed
```

An empty result is the pass. The history form is the same pattern over every commit's added lines
(`git log --all -p`) and over every message (`git log --all --format=%B`).

**The tree.** The normative text, the schemas, the corpus and its emitters were already clean. The one
file that was not was the private provenance note that sat beside them, which said of itself that it
does not travel and is deleted at any public cut. It has left the repository; its content is kept on
the maintainers' private side, and the narrower sweep it carried is superseded by this one.

**The history.** 17 commits on every ref. The provenance note was added or changed in 10 of them
(`206f567`, `a0e5917`, `9741fa2`, `8572ed4`, `97ccdbc`, `aa82f03`, `49adadc`, `36c6c46`, `3a9daa2`,
`3e87058`), and its text is private context throughout, beyond the 3 added lines in 2 commits
(`206f567` 2, `97ccdbc` 1) and the 1 message line (`3a9daa2`) the patterns match. So the history
carries content the rule excludes. It is not rewritten here: whether this repository's public flip
(fuaran#2014) publishes a fresh curated tree instead of the existing history is the maintainers'
decision.

## Licence

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
