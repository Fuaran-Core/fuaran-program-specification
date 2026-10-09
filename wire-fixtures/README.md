# The conformance corpus

The executable half of [`PROGRAM_WIRE.md`](../PROGRAM_WIRE.md). Where the prose and these bytes
disagree, that is a defect in the prose: these are emitted from running code, and prose is not.

**[`manifest.json`](manifest.json) is the authoritative enumeration.** Families, vectors, scenarios,
digests, refusal classes and derived expectations all live there. Do not count any of them from a
prose description of this corpus, including this file — counts drift, and a manifest cannot.

## Two kinds of family

The corpus certifies two different claims and keeps them apart on purpose.

| | Enumerated in | What it certifies | Applies to |
|---|---|---|---|
| **Shape families** (`families` / `vectors`) | one file per vector, whose bytes are the document | a **codec** — documents round-trip, ill-formed ones are refused for the right class | every implementation, whole-corpus |
| **Scenario families** (`scenarioFamilies` / `scenarios`) | one directory per scenario, of three files | a **loop** — a host implementing §6 folds step by step as recorded | only a host that has declared it implements the bounded path (§10.2) |

The separation is not cosmetic. A scenario handed to a codec harness would be round-tripped, which
is meaningless; a host that only decodes these documents is **out of scope** for the scenario family
rather than failing it. So the two live in separate top-level arrays, in disjoint family lists, under
a `kind` neither side can spell — and [`check-manifest.mjs`](check-manifest.mjs) enforces all three.

## Two subjects

The shape families are carried at two **subjects** (§10.7), which differ only in the vocabulary their
referenced positions (§3) hold. A vector with no `subject` member is at the **referenced** subject —
the tree wire specification's actions, ops and client effects, which every vector meant before the
toy subject existed. A vector carrying `"subject": "toy"` is at the **toy** subject: the same
documents with the toy witness's action, `Relabel` op and `Sound` effect (§10.6) in those positions,
filed in the families `toy-handler`, `toy-server-effect`, `toy-client-effect` and `toy-outcome`.

Two documents carry no referenced vocabulary at all — **invocation** and **logic-tree-ref** — and the
manifest's `vocabularyFreeDocuments` names them. They are not duplicated: a host at the toy subject
certifies their vectors as they stand. So a host's run is selected by subject:

| A host at | runs |
|---|---|
| the referenced subject | every vector with no `subject` |
| the toy subject | every vector with `"subject": "toy"`, plus every vector with no `subject` whose `document` is in `vocabularyFreeDocuments` |

§10.7 records, family by family, which vectors of one subject have no counterpart at the other and
why.

## What a vector is

Every vector is one file whose **bytes are the document**: UTF-8, no byte-order mark, no trailing
newline, no wrapper. The manifest records a SHA-256 of the file itself, so a fixture edited by hand
is detectable even where the edit is a valid document.

Two kinds:

| Kind | What a conformant implementation does |
|---|---|
| `round-trip` | decode it, re-encode it, and produce **byte-identical** output |
| `reject` | refuse it, **for the class named in `reject`** |

Every vector also names the **`document`** it is — the top-level shape a reader should be handed.
**Dispatch on that, not on the family**: a family is an organising grouping, and `cross-layer`
deliberately carries a *handler* document, because a rule about a call action can only be demonstrated
by a document that contains one. A harness that dispatched on family would feed it to the wrong reader,
and might then "pass" by refusing for an unrelated reason.

A `reject` vector's class is drawn from Appendix A of the specification. Refusing for some other
reason is not a pass: it would let a reader certify by being broken in a convenient way, and the
whole point of naming the class is that "my parser threw" and "my reader applied the rule" are
different facts.

Handler `round-trip` vectors additionally carry **`replaySafety`** (§7.4) and **`replayReasons`**
(§7.5) — values a conformant implementation must **recompute** from the decoded document. Reading
either off the manifest certifies nothing; a derived value nobody re-derives is a constant with a
longer name.

The reasons are the finer of the two, and they are what makes the expectation discriminate an arm
rather than a grade: two defect tokens of one grade produce one `replaySafety`, so a reader that
confused `relative-addressing` with `non-literal-write` would pass a corpus pinning only the value.
Each is a stage **ordinal** and a token from §7.5's closed vocabulary, compared as an ordered
sequence — a reason attributed to the wrong stage is a locator pointing at the wrong place while the
verdict stays exactly right.

Five of §7.5's six tokens are covered here, each by a handler vector carrying that token **and no
other**; the sixth, `unencodable-op`, is not, and §7.5 says why it cannot be: it names a defect in a
reader's own rendering of a referenced position, and no conformant document reaches it. A host
certifies that one against its own construction. The manifest check enforces the other five, so an
arm that lost its discriminating vector is a named failure rather than a silence.

At the toy subject the handler vectors' derived values are recomputed by §10.7's table of the toy's
cases, and four tokens are reachable rather than five: the toy's one op always names its target, so
no toy document exhibits `relative-addressing`. The manifest check holds `toy-handler` to
discriminating those four and asserts that no toy vector carries the other two.

## What a scenario is

A **driver-semantics** scenario is a directory of three files: the tree a bounded loop starts from,
the event script that drives it, and the per-step trace it produces. Full specification in §10.3;
the parts easiest to get wrong:

| File | |
|---|---|
| `tree.json` | the starting interface tree — a *referenced* document (§3), owned by another specification |
| `events.json` | the ordered script; each entry names a node, an event and a payload |
| `expectation.json` | the trace: `{ "tree", "effects", "refused" }` per step — plus an optional `"denials"` — **index 0 being the state before any event** |

**A step's tree is compared semantically; its effects are compared byte-for-byte; its denials are
decoded.** The tree is embedded as a *document*, so a host decodes it with its own decoder and
compares against its own resolved tree — this corpus does not own the tree vocabulary and cannot hold
you to its bytes. The effects are recorded as *strings whose contents are the effect documents' own
bytes*, because that family's envelope is the specification's one enumerated exception (§5.2) and
embedding them as objects would let any JSON writer re-order their members and quietly erase it. The
denials are neither: §5.3's shape is one this specification owns outright, so they are embedded as
objects and you certify by **reading** them into your own denial vocabulary — which is what makes the
comparison assert that you recognise the vocabulary rather than that two strings matched.

**`denials` records what your PERFORMER SEAM declined**, and it is the member that makes §5.5's
"refusal is conformant, silence is not" falsifiable: `effects` says what the fold emitted, so before
this member a host that dropped an effect in silence and one that declined it audibly produced the
same trace. A declined effect still appears in `effects` — the fold reached that arm with those
values — and the denial beside it says the host did not perform it.

**Absent means none-or-unobserved; empty means observed-and-nothing-declined.** That is the one place
in this corpus where an omitted member and an empty array carry *different* facts, and it is
deliberate: a host whose scenario runner consults no seam must be able to say so honestly rather than
claim it declined nothing. A scenario that records denials names a **`hostPolicy`** in its manifest
entry, and every host **constructs** what that name denotes — the corpus never carries a policy as
data, because a corpus that did would be specifying one. An unrecognised name must fail; falling back
to your own default reports a scenario you could not evaluate as one you passed.

**Report the FIRST divergent step.** A final-state comparison passes a fold that diverges at step 2
and re-converges at step 5, which is the principal defect the family exists to catch.

**There are two scenario families, and the second is over a witness this corpus owns** (§10.6).
`driver-semantics` records UI trees, a referenced vocabulary; `driver-semantics-toy` records the
**toy witness**, whose tree, op, state and effect are specified here — so a host can certify the
bounded loop without implementing the tree wire specification. Three things differ in the toy
family: its `tree.json` is the tree's **canonical bytes** and a step's tree is compared as a document
this corpus owns; its one effect is `Sound`, recorded as emitted in the toy emitter's member order;
and it records **no denials**, since it registers no host policy. It also carries the first scenarios
that presume a second obligation, **`handler-loop`**: each names a handler set in **`hostHandlers`**,
which every host constructs from the name (§10.6 registers `toy-relabel`), and a placement that
answers no call is out of scope for them — not failing them. §10.6 records, per family, which
scenarios have no counterpart in the other and why.

## Certifying

1. Run every vector the manifest enumerates, by its `kind`.
2. **Assert your run count equals the manifest's vector count for your subject** (the table above).
   A harness that silently skipped a family reports the same green as one that passed it.
3. **Assert a mutated fixture makes you go red.** Flip one byte inside a round-trip document in a
   scratch copy and require your own harness to fail. A conformance harness is exactly the kind of
   code that passes by doing nothing.
4. Implement the behavioural obligations — §6 (the two phases and the atomicity unit), §7.2 (the
   replay modes) and §8.2 (at-most-once admission). Bytes are half of conformance here; the other
   half is what a host does when it runs one.
5. **If — and only if — you implement the bounded path**, declare that (§10.2) and run every scenario
   the manifest enumerates, asserting the same two things about your harness that steps 2 and 3 ask
   for vectors. A host that does not implement the loop skips this step and is not thereby
   non-conformant; it is out of scope for the family.

## Verifying the corpus itself

```
node emit.mjs              # the resident emitter, against the committed bytes
node emit-independent.mjs  # the second emitter, against the same bytes
node compare-emitters.mjs  # the two emitters against each other
node check-manifest.mjs    # the manifest still describes the tree it sits in
node check-scenarios.mjs   # the scenarios still have the shape §10.3 gives them
```

or `pwsh ../run.ps1`, which runs all five and then proves each can fail.

They answer four different questions and none subsumes another. **An emitter** asks whether the text
still determines the bytes. **The comparison** asks whether it determines them for two readers rather
than one — a rule the text left open is one a single emitter cannot fail, because it is free to close
the rule its own way and the fixtures it mints then pin that choice as though the text had made it.
**The manifest checker** asks whether the index still describes the tree, a class no emitter can see,
since each only ever looks at vectors the manifest already lists and a fixture the manifest forgot is
invisible to it and to every implementation certifying against it. **The scenario checker** asks
whether a recorded trace is *well-formed*, which none of the others can: a scenario is not a wire
document, and an index cannot tell a well-formed trace from a plausible one.

## Two emitters, and what to do when they disagree

`emit.mjs` mints the bytes; `emit-independent.mjs` was written from `PROGRAM_WIRE.md` alone, in a
separate pass, and deliberately **cannot write** — a second writer would let a divergence be settled
by rewriting the corpus, which is the one move the arrangement exists to prevent.

Both hold the same reference *values*: no text can say a handler is named `orders.refresh`, and that
is not what is being triangulated. What they derive separately is everything the specification
actually specifies — the envelopes, which members are present and which omitted, Ordinal ordering at
every depth, both escaping flavours, number rendering, the client-effect family's declaration order,
and the derived `replaySafety` of §7.4 together with the `replayReasons` of §7.5.

**So when they disagree: read the text, not the emitters.** The question is first whether the
specification determines those bytes at all. If it does, one emitter has a defect and the text names
which. If it does not, the defect is in the **text**, and the fix is the five-artefact change-set in
[`../CONTRIBUTING.md`](../CONTRIBUTING.md) beginning with the sentence that failed to decide. Settling
it by editing whichever emitter looks wrong converts a specification defect into a convention two
files share — which is exactly the state a second emitter exists to detect.

**What no checker here does is REPRODUCE a scenario.** A wire document can be re-derived from a model
by anyone who has read the text; a step trace is the output of a bounded loop, and re-deriving one
would mean writing a second interpreter. So a scenario's *content* is certified by the hosts, and
§11.3 records the second implementation that would triangulate it as deliberately deferred rather
than quietly absent.

## Referenced vocabularies

Some positions carry values of a vocabulary specified elsewhere (§3): a compute stage's action, an
op-bearing effect's ops, and a read effect's source and pipeline. The emitter here derives their
**ordering and escaping** — it encodes them from models through the same canonical encoder — but not
their **semantics**, which belong to the specifications §3 names and are certified against their own
corpora. Conformance here asserts that such a position round-trips, not that its algebra is correct.

## Adding a vector

Round-trip vectors are **generated**: add the model to `emit.mjs`, **to `emit-independent.mjs` and to
`emit-ordinal.py`**, add its manifest entry by hand (with `"subject": "toy"` at the toy subject), run
`node emit.mjs --write`, then `node compare-emitters.mjs` and `node check-manifest.mjs`. A toy handler
is classified in each emitter by §10.7's table of the toy's cases, never by the referenced subject's
walk. Write the second model from the specification rather than by copying the
first: a vector both emitters derived from one reading is a vector neither of them triangulates, and
it will look exactly like the others. Reject vectors are **hand-authored** and
deliberately absent from the emitter — reproducing the bytes of a document that must be refused
demonstrates nothing about the refusal.

## Adding a scenario

Scenarios are **generated by a host**, which is the honest arrangement: the trace is what a bounded
loop does, so the only thing that can write one is a bounded loop. The sequence:

1. add the scenario to a conformant host's seed set and regenerate — a host's emit path must refuse
   to record a trace while its own placements disagree, since a trace minted from a divergence
   enshrines the bug as the contract;
2. add the manifest entry by hand (`id`, `family`, `name`, `kind`, `requires`, `dir`, `files`,
   `description`, and `hostPolicy` or `hostHandlers` where the scenario presumes one);
3. `node check-scenarios.mjs --write` to refresh the digests and step counts;
4. `pwsh ../run.ps1`.

Step 2 is deliberately manual and step 3 deliberately refuses to invent entries: a host that could
add itself to the index it is certified against would be grading its own paper. Do not hand-edit a
recorded trace for the same reason a round-trip fixture is never hand-edited — the result is
internally consistent and no longer describes what any loop does.

Either way the change is not finished in this repository: [`../CONTRIBUTING.md`](../CONTRIBUTING.md)
carries the five-artefact forward-coupling rule, and the fifth artefact is every host that certifies
against this corpus.
