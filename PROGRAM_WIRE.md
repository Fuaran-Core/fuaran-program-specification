# Program wire specification

**Version 1 · Apache-2.0**

A *program* is behaviour carried as data: an ordered, total algebra of sequencing, typed branching
and **named** effects, which a host can read, check and refuse **before** it runs any of it. This
document specifies the wire documents that make such a program portable — **language-neutrally**.
An implementation in any language becomes a conformant host by *conforming*: emitting and consuming
these documents byte-correctly, and honouring the execution obligations §6–§8 state.

Everything normative is in §1–§11. The conformance corpus in [`wire-fixtures/`](wire-fixtures/) is
the executable half. Where this prose and the corpus disagree, that is a defect in this document and
the corpus is the tie-breaker — it is emitted from running code, and prose is not.

**Shared conventions.** This specification is written under the conventions stated in
`SPEC_CONVENTIONS.md`, published with the tree wire specification — canonical bytes, the corpus as
oracle, the manifest as the authoritative enumeration, declared conformance scope, forward coupling,
and how a specification in this family extends. They are normative here; where this document
diverges from one, it says so — §2's client-effect envelope and §10.1's whole-corpus scope are both
such statements.

**Key words.** MUST, MUST NOT, SHOULD, SHOULD NOT, MAY are used in the RFC 2119 sense.

---

## 1. Scope

Six shape families are specified.

| Family | Answers | Emitted / consumed by |
|---|---|---|
| **handler** | what does a host-registered handler declare, as data? | a logic host |
| **server-effect** | what may a handler ask of the host it runs in? | a logic host |
| **client-effect** | what may a program ask of a rendering surface? | a logic host and a rendering surface |
| **invocation** | what reaches a handler, and under what identity? | a logic host |
| **outcome** | what did one handler run produce? | a logic host, read by its caller |
| **cross-layer** | how does a composition surface name a program, and a program name what it calls? | a composition host and a logic host |

The conformance corpus that accompanies this document carries a **second kind of family** beside
those six: **driver-semantics** scenarios, which pin what §6's loop *does* rather than what a
document *is*. They are enumerated separately, they apply only to a host that has declared it
implements the bounded path, and §10.2–§10.3 specify them. There are two scenario families: one over
the tree wire specification's vocabulary, and one over a toy witness this document owns, so that the
loop can be certified without a second specification in the room (§10.6).

The codec families are carried at a second **subject** in the same way: §10.7 repeats the handler,
server-effect, client-effect and outcome families with the toy witness's vocabulary in their
referenced positions, so the codec, too, can be certified without the tree wire specification.

**In scope:** those documents, their canonical encoding, the closed effect vocabularies and the
capability names derived from them, what conformance requires of an effect and what it deliberately
leaves to a host, the two-phase execution semantics a conformant host MUST implement, the two replay
modes and their obligations, the idempotency decision, what a conformance claim over the bounded
loop asserts and the declaration it presumes, and the versioning discipline that keeps all of it
compatible.

**Out of scope, deliberately:**

- **The action algebra's own encoding.** A handler's compute stages carry *actions*, and actions
  already have a canonical serialisation — specified by the **tree wire specification**, the
  language-neutral contract for an interface tree, its bindings, its actions and its tree-ops.
  This document does not respecify a single action arm. §3 states how a foreign vocabulary rides a
  position here.
- **The tabular pipeline vocabulary.** A read effect declares a source and a pipeline over it. Both
  are values of a separate substrate algebra with its own canonical encoding and its own conformance
  corpus, spliced in byte-stably. §3 again.
- **Transport, session establishment, authentication and authorisation policy.** A host decides who
  may reach a handler; this document specifies what a handler *is* and what running one obliges the
  host to report.
- **Durable storage of a program, an outcome or an idempotency record.** Where a host keeps them is
  a hosting concern; §8 states only what a host that keeps them MUST then do.
- **Concurrency between two sessions running handlers against the same domain state.** Recorded as
  open in §11.2, not answered here.

---

## 2. Canonical encoding

The documents this specification **introduces** — every family in §1 except **client-effect** — adopt
the canonical JSON discipline of the tree wire specification. The rules that bite here are restated;
they are not new, and an implementation that already emits canonical trees is already compliant.

1. **UTF-8, no byte-order mark.** Structural punctuation is ASCII. Non-ASCII characters inside
   strings pass through as their literal UTF-8 sequence — no `\uXXXX` escaping of non-control
   characters.
2. **A document's bytes end at its last `}` or `]`.** There is no trailing newline. A fixture file's
   bytes **are** the document.
3. **Object members are ordered by Ordinal comparison of their keys** on encode — not culture-aware,
   not case-insensitive. **Ordinal means numeric comparison of UTF-16 code units, unit by unit**: a
   key is compared as the sequence of 16-bit units its UTF-16 encoding produces, and the first pair
   that differs decides, a shorter key that is a prefix of a longer one sorting first. This is
   stated rather than left to the reader's runtime because the phrase alone does not determine the
   order: comparing by **code point** — which several languages do natively, and which agrees with
   UTF-8 byte order — gives a *different* answer, and the disagreement is narrow enough to hide. A
   character outside the Basic Multilingual Plane encodes as a surrogate pair whose leading unit
   lies in U+D800–U+DBFF, so **Ordinally it sorts below every character in U+E000–U+FFFF, and by
   code point it sorts above all of them.** Everywhere else the two orderings coincide, so an
   implementation that sorts by code point is correct on every key an implementer is likely to try.
   `server-effect/notify-ordinal-divergence` is the corpus vector that tells them apart.
   `$type` (U+0024) sorts before every lower-case data key, so a discriminated
   object always begins with it. **A decoder MUST accept any member order**; lookup is by name. The
   rule reaches **every object at every depth**, an opaque payload position (§5.1) included: a
   payload this document declines to *decompose* is still a JSON object on this wire, and an encoder
   that passed one back out in whatever order it arrived would break the byte-identity §10.1
   requires of a round-trip. That is spelled out for the same reason rule 5 spells it out — read
   without it, "opaque" is as easily heard as "not re-encoded".
4. **Arrays preserve order.** A stage list, an op list, a pipeline and the `performed` audit trail
   are all ordered structures and their order carries meaning. Empty arrays render `[]`.
5. **There is no JSON `null` on this wire.** An absent optional member is **omitted**; a member whose
   value is the token `null` MUST be refused (`null-member`), at any nesting depth, including inside
   an opaque payload position. A decoder MUST NOT synthesise `null` for an absent key.
6. **Discriminated unions render as `{"$type":"<CaseName>", …}`**, the case name spelled exactly as
   §5's tables spell it. An unrecognised case name MUST be refused; the vocabularies here are closed
   (§5.4) and a wire cannot widen one.
7. **Strings escape `"`, `\` and the control range** `U+0000`–`U+001F` (as `\u00xx`, lower-case hex)
   and nothing else.
8. **Numbers** follow the tree wire specification's pinned float layout. An integer renders without a
   fractional part.
9. **No member is emitted that a reader must ignore.** A document member this specification does not
   declare MUST be refused (`undeclared-member`). This is stricter than a must-ignore rule and it is
   deliberate: §4.4 explains why, and it is the mechanism that keeps §5.1's capability derived rather
   than asserted.

**The one enumerated exception is the client-effect family (§5.2)**, whose wire form predates this
document. It uses a `kind` member rather than `$type` and orders its members by declaration rather
than Ordinally. It is specified **as it is emitted**; see §5.2 for why that is not corrected here.

---

## 3. Referenced vocabularies

Five positions in these documents carry values of a vocabulary specified elsewhere:

| Position | Vocabulary | Specified by |
|---|---|---|
| a compute stage's `action` (§4.2) | the action algebra | the tree wire specification |
| an op-bearing effect's `ops` (§5.1) | the tree-op algebra | the tree wire specification |
| a read effect's `source` and `pipeline` (§5.1) | the tabular source and transform algebra | the substrate's own columnar/pipeline specification |
| an outcome's `patches` (§6.3) | the tree-op algebra | the tree wire specification |
| a `Bounded` diagnostic's `diagnostic` (§6.5) | the action algebra's diagnostic vocabulary | the tree wire specification |

A scenario's `tree.json` (§10.3) is a referenced *document* on the same terms, and the three rules
below govern it too; it is named there rather than tabulated here because it is a corpus file rather
than a member of a document this specification introduces.

The last two rows are the ones easiest to leave off a list like this, and both matter: `patches`
carries the same algebra as `ops` under a different name, and the `Bounded` pass-through is the
position §11.2 records an open residual against — a residual whose whole content is that the value
there belongs to another specification, which is precisely what makes it a referenced position and
not an opaque one.

Three rules govern such a position, and they are what make "referenced" mean something:

1. **The sub-document is spliced byte-stably.** It is encoded by the vocabulary's own canonical
   encoder and inserted verbatim. Both encoders sort object members Ordinally, so the composite
   document has one canonical form and not two.
2. **This document never re-spells a referenced case.** Where a rule here needs to talk about a
   referenced value it does so by the other specification's own name (`Call`, `SetState`,
   `RemoveNode`), never by restating its shape. A rule that needed to restate a shape would be a rule
   in the wrong document.
3. **A referenced position is still subject to §2 rule 5.** The prohibition on `null` is a property
   of *this* wire, so a spliced sub-document carrying a `null` member is refused here even where its
   own specification would tolerate it. Both vocabularies named above already forbid it, so this rule
   is a guarantee rather than a restriction.

An implementation certifies the referenced vocabularies against **their** corpora. Conformance here
asserts that a referenced position round-trips, not that its algebra is correct.

At the **toy subject** (§10.7) the action, op and client-effect positions carry the toy witness's
vocabulary instead (§10.6) — a vocabulary this document owns rather than references — and §10.7's
table says what each position holds there.

---

## 4. The handler declared form

### 4.1 The envelope

A **handler** is a named, ordered list of stages and nothing else. No closure, no host reference, no
captured state.

```json
{"$type":"Handler","name":"orders.refresh","stages":[]}
```

| Member | Required | Type | Meaning |
|---|---|---|---|
| `$type` | yes | `"Handler"` | the document discriminator |
| `name` | yes | string, 1–256 characters | the registration key a host registers this handler under |
| `stages` | yes | array of **stage** (§4.2) | the ordered decomposition |

`name` MUST NOT be empty (`empty-name`) and MUST NOT exceed 256 characters (`name-too-long`). A
handler with **no** stages is well-formed and conformant: it is the honest empty handler, not an
error.

`stages` is ordered, and the order is the execution order of the plan phase (§6.1).

**"And nothing else" is exhaustive, and §6.6 records the omission a reader is likeliest to read as an
oversight**: a handler declares no delivery, idempotency or restart posture for the host that runs it.
That absence is ruled rather than pending.

### 4.2 Stages

A stage is one of exactly two kinds. The split is the whole design: one kind is the shared algebra,
the other is this placement's effect vocabulary, and a stage list is the only place they interleave.

```json
{"$type":"Compute","action":<Action>}
{"$type":"Effect","effect":<ServerEffect>}
```

| Kind | Member | Meaning |
|---|---|---|
| `Compute` | `action` | an action of the shared algebra (§3), interpreted by the same evaluator every placement runs |
| `Effect` | `effect` | one arm of the server-effect vocabulary (§5.1), gated before it runs |

Any other `$type` MUST be refused (`unknown-stage-kind`). Sequencing is **not** a third stage kind:
a stage list is read in order exactly as the action algebra's own chain folds in order, and what the
list adds is the ability to interleave the two vocabularies.

**A call action inside a compute stage is inert.** The evaluator recognises a call at any depth, but
inside a handler stage it resolves to the documented no-op: it reaches no handler, names no endpoint
a host must serve, and contributes nothing to what the handler demands. A conformant host MUST NOT
let a stage's call action reach the handler registry. Two consequences follow and both are load-bearing:
handler composition stays a **host act** — a host registers the stage list it wants — and termination
stays structural, because a handler naming itself cannot recurse.

### 4.3 What a handler may name, and what it may not

A handler names things: a registration key, a host function, a notification channel, a data source, a
landing slot, a query slot. Every one of them is a **name**, never a value carried for the host to
act on unexamined:

- A **landing slot** (§5.1, `HostCall.into`) MUST NOT be under the host-reserved state namespace
  `host.` (`host-reserved-landing-slot`). A host MUST check this while **planning** — the slot is
  declared, so nothing about the check needs the performer to have run, and refusing at plan time
  means a handler with a bad slot never reaches the outside world at all.

  **The reservation is over the NAMESPACE, so it binds every placement — not only this one.** A
  state write naming a key under `host.` is refused wherever it is interpreted, including by a
  client loop folding a `SetState` (§10.5), and a host MUST NOT honour one at a placement this
  document happens to describe less fully. The reservation exists because a document is untrusted
  (§4.4), and untrustedness is not a property that varies by which loop is running: a reservation
  honoured at the logic placement and not at the client one lets a document reach by the second path
  exactly what it is refused by the first, which is the whole of what the namespace was for. Only
  the *refusal class* is placement-specific — `host-reserved-landing-slot` names a defect in a
  handler **document**, so a client-side write under `host.` is not that class and not a decode
  failure at all: it is a legitimate document whose action does nothing, on the terms §10.5 states.
- A **host function name** is a registration lookup. A host MUST resolve it by exact match against
  its registry and MUST NOT construct, template or otherwise derive a callable from it.
- A **capability** is never carried (§5.1). It is derived.

### 4.4 Once a handler is on the wire, every string in it is untrusted

Before a handler had a wire form, its body was host data: a host registered the stage list, and the
only string that ever came off the wire was the endpoint a program tree named. That asymmetry is what
made it safe to record a host-function name in a log and unsafe to record an endpoint.

**This document abolishes the asymmetry**, and the consequence is easy to miss because it changes no
algorithm — only what an implementation is *allowed to say*. A conformant host MUST therefore treat
every string reaching it inside a handler document as attacker-chosen, and specifically:

1. **A diagnostic MUST NOT echo a wire-carried string** (§6.5). This already governed the endpoint;
   it now governs the host-function name, the notification channel, the source name, the landing slot
   and the handler's own registration key. What a diagnostic carries is the **capability** — which is
   derived from the closed vocabulary, and for a host call is the function name inside a reserved
   prefix, so a host that logs it is logging something whose *shape* it controls.
2. **A wire-carried handler MUST NOT be admitted by default.** Registration remains a host act: a
   host that accepts handler documents from a source MUST decide, per source, that it does so.
   Nothing in this document makes a received handler runnable.
3. **The declared form is checkable before it runs**, and that is the compensation for (1) and (2):
   §5's closed vocabularies, §4.3's name rules and §7.4–§7.5's replay classification are all decidable
   from the document alone, so a host that must be thin on what it *says* can afford to be thorough
   about what it *admits*.

Rule §2.9 — refuse an undeclared member rather than ignoring it — is a direct consequence. A
must-ignore rule invites a document to carry a member some future version might honour, and here the
document is untrusted.

### 4.5 Worked example

A read → compute → mutate → respond handler, which is the decomposition the stage list exists to
write down:

```json
{"$type":"Handler","name":"orders.refresh","stages":[{"$type":"Effect","effect":{"$type":"RunQuery","name":"orders","pipeline":[{"$type":"limit","n":50,"offset":0}],"source":{"ref":"orders","schema":[]}}},{"$type":"Compute","action":{"$type":"SetState","key":"status","value":"loaded"}},{"$type":"Effect","effect":{"$type":"ApplyOps","ops":[{"$type":"RemoveNode","target":"orders-empty"}]}},{"$type":"Effect","effect":{"$type":"EmitPatch","ops":[{"$type":"RemoveNode","target":"orders-spinner"}]}}]}
```

---

## 5. The effect vocabularies

### 5.1 Server effects — the logic host's closed vocabulary

Five arms. The vocabulary is **closed**: a document naming a sixth MUST be refused
(`unknown-effect-arm`).

| Arm | Members | What it does |
|---|---|---|
| `RunQuery` | `name` (string), `source` (referenced), `pipeline` (array, referenced) | **Reads.** Evaluates the pipeline over the source and lands the result in the session's query slot `name`. Touches no domain state. |
| `ApplyOps` | `ops` (array, referenced) | **The only domain-state mutation.** Applies a tree-op sequence through the apply engine. |
| `HostCall` | `fn` (string), `args` (opaque payload), `into` (string, optional) | The named, registered, policy-gated escape to computation the total algebra cannot express. The one arm that reaches outside. |
| `EmitPatch` | `ops` (array, referenced) | Ships ops to a connected rendering surface **without** touching domain state. |
| `Notify` | `channel` (string), `payload` (opaque payload) | An out-of-band host-channel message. The host performs delivery; the handler records that it asked. |

`EmitPatch` is kept distinct from `ApplyOps` so that "what the surface sees" and "what is durable" can
never be confused for one another. `Notify` here is a handler's own declaration and is **not** the
action algebra's notify arm, which is a documented no-op at every placement.

**The capability is DERIVED, never carried.** A gate is asked about a *capability string*, and a
conformant host MUST compute it:

| Arm | Capability |
|---|---|
| `RunQuery` / `ApplyOps` / `EmitPatch` / `Notify` | the arm's own discriminator, verbatim |
| `HostCall` | `"host:" + fn` |

The `host:` prefix keeps the two namespaces disjoint, so a host function named `ApplyOps` can never
be permitted by a rule about the built-in arm. A document carrying its own `capability` member MUST
be refused (`undeclared-member`): a wire-carried capability would be a second spelling of a fact the
host derives, under the control of the untrusted side — the same defect as a wire-carried landing slot
(§9.5), one layer down.

`into` names a state slot the host call's result lands in. It is optional; omitted, the result is
discarded and only the fact of the call is recorded. `fn`, `name` and `channel` MUST be non-empty.

### 5.2 Client effects — the rendering surface's closed vocabulary

Eight arms, closed on the same terms. A program reaches a rendering surface only through these.

| Arm | Members | What it does |
|---|---|---|
| `Navigate` | `route`, `target` | a full navigation; `target` names the browsing context it lands in |
| `PushState` | `route` | update the address without a reload |
| `WriteToClipboard` | `text` | write to the clipboard |
| `Focus` | `nodeId` | move focus to the addressed node |
| `Download` | `url`, `name` | trigger a download with a suggested filename |
| `ReadFileBody` | `nodeId`, `encoding` | read the body of a selected file; `encoding` is one of `"Text"`, `"Base64"`, `"DataUrl"` |
| `Print` | *(none)* | open the reader's own print dialogue |
| `Confirm` | `prompt`, `token` | ask the reader `prompt`; the answer returns keyed by `token` |

**Arms seven and eight arrived at format version 2**, and they are the reason that version exists.
Both were already emitted by a conformant surface before this document declared them — §11.2
recorded that divergence at version 1 rather than fixing it, because §11.1 rules that adding an arm
to a closed vocabulary is breaking and because the fifth artefact of such a change-set is the codec
of every host that certifies against this corpus. Version 2 is that change-set landed whole.

**This family's envelope predates this specification and is specified as it is emitted:**

```json
{"kind":"Navigate","route":"/orders"}
{"kind":"Navigate","route":"/docs/orders","target":"Blank"}
{"kind":"Download","url":"https://example.invalid/report.csv","name":"report.csv"}
```

The discriminator member is `kind`, not `$type`, and it comes first; the remaining members follow in
**declaration** order, **which for the purposes of this document is the order the Members column
above lists them**. So `Download` emits `url` before `name`, and `ReadFileBody` emits `nodeId` before
`encoding` — neither of which is Ordinal order. That the table's order *is* the normative order is
stated rather than left implied: "declaration order" otherwise names a declaration in an
implementation this document does not specify and a reader is not assumed to have, and a reader with
only this text in front of them could then derive `Download`'s bytes from the example below and
`ReadFileBody`'s from nothing at all. §2 rules 1, 2, 4, 5 and 8 apply
unchanged. Rules 3 and 6 do not. Rule 7 holds only in part: this family's encoder additionally spells
the three common control characters with their short escapes (`\n`, `\r`, `\t`) rather than as
`\u00xx`, so a document carrying one differs from what the canonical encoder would produce.

**"In part" is a narrowing of three code points and no more.** Every other character below U+0020
MUST still be escaped as `\u00xx`, exactly as rule 7 requires, and an encoder that emits one raw is
non-conformant — it has produced text that is not JSON at all, which no exception here licenses. The
clause is spelled out because the natural way to implement the exception is a short list of
substitutions applied to a string, and such a list is complete for the three it names and silently
empty for the other twenty-nine. That defect passes every corpus vector whose strings are printable,
which is all of them, and surfaces as a decoder failure at whatever host is handed the document.

**Why this is not corrected here.** These bytes are a shipped wire that a rendering shim already reads.
Re-spelling them would be a breaking change to a live contract, taken for consistency and paid for by
every deployed surface — and it would be taken *in the same document that first pins them*, which is
the worst moment to make a wire decision. Unifying the envelope is recorded as future work (§11.3): it
belongs to a version of this specification that can offer a migration, not to the one that is merely
writing down what exists. What this family gains here is what it never had: a corpus that pins the
bytes, and an enumeration a host can certify against arm by arm.

**`ReadFileBody.nodeId` is the node the EVENT came from**, not a file reference lifted out of the
action that produced it. The two readings both fit the member's name, and only one of them is
usable: the surface asked to read a body has to find the selected file, which it holds against the
node the selection happened on, so a reference taken from anywhere else names something the surface
cannot resolve. `Focus.nodeId` is the same referent under the same name and was never ambiguous;
this arm reads that way too, and the round trip a read completes — a body coming back as a fresh
event on that node — closes on the same identity it opened on.

**`Navigate.target` is OPTIONAL, closed, and omitted at its identity.** It names which browsing
context the navigation lands in. The set is closed at `"Self"` and `"Blank"` — a document naming a
third value MUST be refused (`undeclared-member`), for the reason `ReadFileBody.encoding` is refused
the same way: a member drawn from a closed set carries no meaning outside it, and a reader that
passed one through would be handing a rendering surface a context it has no rule for. It is a closed
set rather than a free string on purpose: the values a rendering surface can act on are two, and an
open target member is a place an untrusted document names something the surface then has to decide
about.

**`Self` is the identity, and the identity is NOT written.** An encoder MUST omit `target` when it is
`Self`; a decoder MUST read absence as `Self`. So `{"kind":"Navigate","route":"/orders"}` — every
byte sequence a rendering shim has ever been handed for this arm — is unchanged and means exactly
what it always meant, and `"Blank"` is the only value that ever appears on this wire. A document that
spells `"target":"Self"` carries a declared member holding a declared value and is therefore
**accepted**, but it is not what the encoder produces, so it does not re-encode to its own bytes and
cannot be a round-trip vector; the corpus pins the omission by carrying the two canonical forms and
not that third one.

**This is additive by §11.1's rule and the arithmetic is the `origin` arithmetic** (§5.3): an
optional member appeared, no arm was added to the closed vocabulary, no required member appeared, and
no existing member's type or order moved. Every client-effect document recorded before this change is
byte-identical after it — which is the whole reason the identity is omitted rather than written.

**`Print` carries NO members, and the emptiness is normative rather than incidental.** Its whole
document is `{"kind":"Print"}`. The paged medium belongs to the host and every parameter of the
printing — page size, sheet range, margins, copies, which subtree — belongs to the reader's own
dialogue, so there is nothing here a program could constrain and nothing a future host could learn
from a member. A document carrying any member beside `kind` MUST therefore be refused
(`undeclared-member`), on the same footing as every other undeclared member: accepting one would
leave an emitter believing it had constrained a printing it had not. It is the first payload-free
arm in either vocabulary. Its derived capability is `Print`, the arm verbatim, as §5.1's rule gives
it. It returns nothing: a surface reports neither whether the reader printed nor what they chose,
so unlike `ReadFileBody` there is no result event, and a host that invented one would be reporting
a fact it does not have.

**`Confirm` carries `prompt` and `token`, both REQUIRED strings, and the continuations are
deliberately absent.** `prompt` is the question put to the reader. `token` names WHICH confirmation
in the originating gesture is being answered, so a chain raising two of them is unambiguous. Either
member absent MUST be refused (`missing-member`); a member outside the two MUST be refused
(`undeclared-member`). Its derived capability is `Confirm`.

**What a yes will DO is not on this wire, and that is the arm's central rule.** The instruction says
what to ask and nothing about what happens next. The branches belong to whoever holds the tree, the
gate and the egress policy; shipping them would move that decision to the least trusted party in the
system, and a surface handed the branches is a surface that can perform them without ever asking.

**The answer returns on the ORIGINATING event, re-delivered.** It is not a new event name and not a
second document family. The surface re-raises the event that produced the confirmation, carrying two
additional payload members: `confirmToken`, the `token` verbatim, and `confirmAccepted`, a JSON
boolean. The answer therefore passes through the same node-exists, event-legitimate,
payload-in-bounds and gate boundary the first delivery passed through, and is re-validated in full
on arrival. This is the shape §5.2 already has for a file-body read — a result arriving as a fresh
event on the node the read opened on — and it is named here because a round trip whose return path
is unspecified is half an instruction.

**`token` is UNTRUSTED, exactly like every other value on this wire.** The surface chooses what it
sends back, so a host MUST NOT treat a token as evidence of anything: it addresses a question, it
does not authorise an answer. A conformant host resolves the token against the action the addressed
node resolves to NOW, and one that addresses nothing there is an ordinary consequence of a tree that
moved on, never an error. A bounded loop also CORRELATES the answer: it admits only an answer to a
question it asked and has not yet seen answered or withdrawn, and refuses any other as an event —
§10.5 states the rule. **A confirmation is a courtesy to the reader and never an authorisation**
— a hostile surface answers yes without showing anyone a dialogue — so anything that must not happen
without permission is refused by the gate the continuation meets on its own, never by the question.

An unrecognised `kind` MUST be refused (`unknown-effect-arm`).

### 5.3 Denials

An effect that did not run produces a **denial**, and a denial carries the **capability** — never the
pipeline, the ops, the arguments or the message.

```json
{"$type":"Unregistered","capability":"host:payments.settle"}
{"$type":"GateRefused","capability":"ApplyOps"}
```

The two arms are kept apart because they say different things and only one of them is resolvable by
changing policy: `Unregistered` says *this host does not have that capability*, `GateRefused` says
*this host has it and refused this use of it*. Collapsing them loses the more useful fact.

**Where the refusal's ground was the DESTINATION, the denial names the origin — and only the
origin.** A host may decline a use not because the capability is closed to the program but because
the *place* the effect named is not one the host declared (§10.5's stricter-policy paragraph is the
rule that permits such a host to exist). That is still `GateRefused` — the host has the capability
and refused this use of it — so the arm is unchanged, and what is added is the optional member that
says which use:

```json
{"$type":"GateRefused","capability":"Navigate","origin":"exfil.example"}
```

| Member | Required | Meaning |
|---|---|---|
| `$type` | yes | the denial arm |
| `capability` | yes | the derived capability (§5.1) — for the client vocabulary, the arm verbatim |
| `origin` | no | the destination the refusal was about, when it was about one |

Three rules govern it, and each is load-bearing.

**`origin` is the ORIGIN, never the URL.** A network destination yields its **host** — no scheme, no
port, no path, no query; a destination with no network host yields the class instead (`mailto:`, or
`unparseable` where the scheme floor refused it outright). This is §6.5's log-safety rule applied one
layer down and it is not a stylistic preference: a denial record outlives the session that produced
it, and the query string of a refused exfiltration attempt **is** the payload, so a refusal that
quoted it would become the disclosure it exists to prevent.

**`origin` may appear only on `GateRefused`.** An `Unregistered` denial says the capability was never
reachable, at which point no destination was ever consulted; a document carrying one anyway MUST be
refused (`undeclared-member`), for the reason §5.1 refuses a self-declared `capability` — a member
that cannot describe the fact it sits beside is a second, contradictory spelling of that fact.

**Its absence is not a claim that the destination was permitted.** A denial with no `origin` is one
whose ground was not a destination — the capability was closed, or the discriminator gate declined
the arm before any payload was parsed. Ordering is what makes that honest, and §5.4's two independent
facts are what it rests on: registration first, then the gate, then the destination. So an effect
this host does not perform at all is refused before its payload is even read, and the resulting
denial correctly says nothing about where it would have gone.

**No arm of the server vocabulary (§5.1) names a destination**, so an `origin` is not reachable on a
denial inside an outcome document today, and the schema for that position narrows accordingly. That
narrowing is a schema recording where the member can currently occur, not a second rule: the shape is
declared once, here.

### 5.4 Extension is a host act

Neither vocabulary is widened by a document. A host extends its reach by **registering a performer**
for a host call, behind a gate that still decides — so a program may *name* only what its host
registered, and a genuinely novel capability is a host act taken before any program arrives. A
conformant host MUST refuse an unknown arm rather than passing it through, and MUST NOT offer any
mechanism by which a document declares a new one.

The registry and the gate are **two independent facts**, and a conformant host MUST keep them so: an
unregistered host function is unreachable however permissive the policy, and a registered one is still
subject to the gate. The default for both is deny.

### 5.5 What conformance requires of an effect: that it is reached, not what it does

A vocabulary is closed so that a host can know in advance what it may be asked for. It does not
follow — and this document does not say — that two conformant hosts asked for the same effect must
do the same thing with it. Three cases, decided here rather than left to whatever a harness happens
to compare.

**Recognition is normative.** A conformant host MUST recognise every arm of the vocabulary its role
reaches, derive that arm's capability (§5.1), and refuse an arm outside the vocabulary
(`unknown-effect-arm`). This is the whole of what a *document* can oblige, and all of it is
decidable before anything runs.

**Performance is host-defined, and a host that performs an effect differently is CONFORMANT.** A
surface satisfies `Navigate` by replacing a document, by pushing onto a native stack, or by handing
the route to an embedding shell; a host with no address bar has nothing for `PushState` to update
and no obligation to invent one. The arms are spelled in the vocabulary of the surface that
motivated them rather than in a neutral one, so reading them as a prescription of *mechanism* would
make conformance depend on a runtime this document does not specify and does not wish to. What a
claim fixes is that the arm reached is the arm the program named, with the values it named, in the
order it named them.

**Refusal is CONFORMANT; silence is not.** Both vocabularies default to deny (§5.4), so a host that
refuses every effect is conformant — an effect a host has not enabled is exactly what a default-deny
gate is for, and a specification that made refusal a failure would have written a mandatory
capability list instead of a gate. But the refusal MUST be **reported**, as a denial carrying the
derived capability (§5.3), and a conformant host MUST NOT drop an effect silently. That half is
load-bearing: in the outcome document a silently-dropped effect and a performed one are
indistinguishable, so silence converts a policy decision into an unexplained absence in the one
record a caller has. Refusing audibly is what keeps `performed` (§6.3) an audit trail rather than a
list of things that may or may not have happened.

**What this forecloses.** A conformance claim over these vocabularies is **not** a claim about
behaviour at a surface, and a host MUST NOT advertise it as one. Nothing here obliges a rendering
surface to navigate, to write a clipboard, or to start a download; what it obliges is that a host
asked to do one of those either does it and says so, or declines and says which capability it
declined. §10.3's driver-semantics family is built on exactly this line — it records which arm a
step reached, never what the world did next.

---

## 6. Handler execution semantics

A conformant host MUST implement this section. It is not advisory: the outcome document (§6.3) is only
meaningful against it.

### 6.1 Two phases

A handler run has a **PLAN** phase and a **PERFORM** phase.

**PLAN.** Every stage runs in declared order. A compute stage folds. A read effect evaluates. An
op-applying effect edits an in-memory tree. A patch and a notification accumulate as values. A host
call is **gated, resolved to a performer, and its landing slot checked — and then STAGED, not
invoked**. Everything this phase does is either a read or a value the caller can discard.

**PERFORM.** Reached **only** if the plan phase completed with no halt. The staged host calls are
invoked in **declaration order** and their results land in their declared slots.

The gate is consulted **first** for every effect — before a pipeline is evaluated, before an op
reaches the apply engine, and before a performer is looked up as a callable — so no side effect of any
kind can precede the policy decision.

### 6.2 The handler is the unit of atomicity, and only one arm is staged

A denial or a failure sets a halt: the remaining stages are skipped and the accumulated store, ops,
patches, notifications and client effects are discarded in favour of the state the handler started
from. **A partially-applied handler is unrepresentable in the outcome**, which is a stronger guarantee
than rolling back on error, because there is no code path that could forget to.

Of the five server-effect arms, **only `HostCall` is staged**, and that is the honest boundary: a read
reads, an op-apply edits an in-memory tree the caller may discard, and a patch and a notification are
values the host performs after the handler returns. None of them can be performed too early because
none of them is performed by the handler at all. Deferring the reads as well would be a purer reading
of "two-phase" and a worse design: it would break the read → compute → mutate shape that is the entire
reason a handler is a stage list.

**The stated cost.** A later stage MUST NOT be able to read an earlier host call's result. At planning
time there is no result to read. A handler needing that shape is two handlers, or one host function
that does both halves.

**The residual, which staging moves but does not abolish.** A performer that fails during PERFORM
leaves its predecessors run, and no fold can undo them. What conformance requires is that this be
**reported, never absorbed** (§6.4).

### 6.3 The outcome document

```json
{"$type":"HandlerReport","committed":true,"diagnostics":[],"notifications":[],"patches":[],"performed":["RunQuery","ApplyOps"]}
```

| Member | Required | Type | Meaning |
|---|---|---|---|
| `$type` | yes | `"HandlerReport"` | the document discriminator |
| `committed` | yes | boolean | whether the handler ran to completion |
| `diagnostics` | yes | array of **diagnostic** (§6.5) | why what happened, happened |
| `notifications` | yes | array of `{"channel":…,"payload":…}` | host-channel messages the handler asked for, in order |
| `patches` | yes | array (referenced) | ops the handler asked to be shipped to a rendering surface, in order |
| `performed` | yes | array of capability strings | the audit trail — see below |

Every member is required even when empty: an omitted array and an empty array would be two spellings
of one fact, and a reader would have to guess which producer it was talking to.

**`performed` is EXECUTION order, not stage order.** Staging defers every host call to the perform
phase, so a host call declared first appears *after* every capability the plan phase ran. Reading this
list as a stage list would be reading it as a declaration; it is an audit trail, and it says what
happened and when.

On an uncommitted outcome, `patches`, `notifications` and the domain state are the entry state, and
`performed` is empty — **except** in the one case §6.4 names.

### 6.4 The one case where an uncommitted handler performed something

If the PERFORM phase itself fails, `committed` is `false`, the store is rolled back, and `performed`
names **exactly the host calls that ran before the failure and cannot be taken back**. The failure is
reported as a `PerformFailed` diagnostic, which is a distinct arm from the planning-phase `Failed`
because the two carry opposite news about the outside world:

| Diagnostic | When | What it says about the world |
|---|---|---|
| `Failed` | during PLAN | nothing external ran |
| `PerformFailed` | during PERFORM | every host call declared before it **did** run |

**Therefore:** an outcome with `committed: false` and a non-empty `performed` MUST carry a
`PerformFailed` diagnostic, and MUST NOT be produced in any other circumstance. A document violating
this MUST be refused (`impossible-outcome`). Reporting `performed: []` after a perform-phase failure
would be the one lie this design exists to avoid.

### 6.5 Diagnostics are log-safe

Five arms, and what each may carry is normative:

| Arm | Members | Rule |
|---|---|---|
| `Bounded` | `diagnostic` (the shared evaluator's own diagnostic) | passed through unchanged, so a compute stage reports exactly what the same action reports at any other placement |
| `Denied` | `denial` (§5.3) | capability only |
| `Failed` | `capability`, `reason` | for a host call, the performer's **own** text — safe verbatim. For an engine failure, the error's **discriminator only**, never its message: an engine message quotes column and parameter names taken from a wire-carried pipeline |
| `PerformFailed` | `capability`, `reason` | the performer's own text |
| `HandlerUnregistered` | *(none)* | **it MUST NOT say which endpoint.** That string is wire-carried, and echoing it into a host's log is the leak every other rule here avoids. A host debugging an emission reads its own registry, which is a closed list it already has |

`HandlerUnregistered` carrying any member MUST be refused (`endpoint-echoed`). The cost — a thinner
error than a developer wants — is real and is recorded rather than argued away; §4.4 point 3 is the
compensation.

**The `Bounded` pass-through is the one residual, and it is stated rather than closed.** The shared
evaluator's diagnostics are governed by that algebra's own rules, and one of its arms carries a
*reason* that may quote a value taken from the action it describes — a state key, say. Before this
document, that value was host data (§4.4); after it, it can be wire-carried. A host that ships an
outcome document across a trust boundary MUST therefore either redact that position or satisfy itself
that its evaluator's diagnostics quote nothing wire-carried. It is not resolved here by tightening the
rule, because the rule belongs to the other specification and tightening it from this one would be a
change made in the wrong document; it is recorded in §11.2 so that it is a known residual rather than
an oversight.

### 6.6 A handler declares no runtime guarantees, and that silence is DELIBERATE

Three properties a caller wants to know about a handler run are members of no document specified
here: **how many times** an invocation that reaches the handler is delivered, **whether repeating the
run changes the result**, and **whether work in flight survives a restart** of the process running it.
§4's declared form carries none of them and §6.3's outcome reports none of them.

**That is a ruling, not a gap.** A conformant host declares those three about **itself**; a handler
document declares none of them, and a document that carried one MUST be refused — as
`undeclared-member` (§2.9), by the mechanism §9.2 spells out, which is that a declaration stating the
only members there are refuses the shapes nobody has thought of as well as the ones somebody has.

Four things decide it, and the third is the one that would otherwise be re-argued each time.

**They are facts about the evaluator, not about the program.** A stage list is a value. A delivery
posture is a property of the transport that carries an invocation, of the store the host does or does
not compose, and of the process lifetime the host runs under. One byte-identical handler is
at-most-once on one deployment and at-least-once on another, and neither reading is the document's to
give. A member here could only ever be a claim about somebody else's machinery, made by the party
least able to keep it — and, under §4.4, by an untrusted one.

**§7.4 already settled the general form of this question, and settled it the other way for a reason
that does not reach these three.** Replay safety is the one execution-adjacent property this document
does state, and it states it as DERIVED — "never declared, because a declaration is free to drift from
the thing it describes and this one need not exist at all". Replay safety is derivable: the stage list
determines it, which is why refusing the declaration costs nothing. These three are **not** derivable
from the stage list, so carrying them would be strictly worse than the declaration §7.4 refused — an
assertion no reader can check against the document it rides on. A corpus could pin such a member's
encoding and never its truth.

**And one of the three is already ruled here, in the other direction.** §8 puts the idempotency
identity on the INVOCATION, makes it optional, and says why it cannot ride the program: a program is
untrusted, and a program-chosen deduplication identity lets an emitted document collapse two
invocations onto one key, or make every invocation unique, at will. §8.4 forecloses a program-supplied
key in as many words. A handler declaring "I am idempotent" would assert the conclusion §8 declines to
let it choose the premise of. The other two facets are the same shape of claim about the same host, so
splitting the three across two mechanisms would be worse than either mechanism alone.

**What is refused is a GUARANTEE; a REQUIREMENT is a different document.** "This host delivers
at-least-once" is a fact about a host. "This handler is unsafe unless what reaches it is deduplicated"
is a fact about the program, and nothing above forecloses stating it. It is not specified here because
it is not needed here: a host composing a program can already enumerate the effects that program and
its reachable handlers can ever reach — a `Notify` is where a delivery question arises, a `HostCall` is
where an idempotency one does — and it knows what its own substrate provides, so the pair is derivable
on exactly §7.4's terms. Should a declared requirement vocabulary ever be wanted, it is a validated
vocabulary with a host-side schema, argued in this document — the §8.4 and §9.5 shape — and never a
member a host quietly starts honouring.

**The cost, stated rather than argued away.** A host composing a program it did not write cannot read
a delivery, idempotency or restart posture off the handler document, so it cannot refuse a composition
on the ground that its substrate is weaker than the handler needs. The derivation named above is
available to it, but a derivation is something each composing host writes, and until one does, a
program placed on a substrate it is unsafe on is admitted without comment. A carried triple would have
made that one check trivial. It would also have made every host's report of its own guarantees a value
chosen by an untrusted document — and a guarantee the guaranteeing party did not choose is not a
guarantee. That is the trade, and it is why this ends in three sentences of loss rather than none.

---

## 7. Replay

### 7.1 What is journaled

**Ops, not invocations.** A handler's output reaches the op sink as a tree-op diff; the invocation
itself is recorded nowhere. Replay therefore reconstructs state by applying ops, and is effect-free by
construction: there is no recorded artefact from which a replaying host *could* re-issue a host call
even if it wanted to. A conformant host MUST NOT journal a handler invocation as a replayable record.

### 7.2 Two modes, named

Replaying the recorded ops reconstructs what a session *did*. Re-deriving a read against current data
is what resuming a session wants. **Both are legitimate, they cannot both be the default, and a host
MUST name which it is in.**

**`audit-replay`** — the default. Reconstructs what happened.

A host in audit-replay MUST:
- apply the recorded ops, in recorded order, and nothing else;
- run **no** handler, evaluate **no** read effect, issue **no** host call, ship **no** notification,
  and emit **no** patch that was not itself recorded.

An audit replay is therefore effect-free unconditionally, whatever the handlers involved declared.

**`resume-replay`** — re-derives reads so a session can continue against current data.

A host in resume-replay MUST:
- apply the recorded ops as audit-replay does;
- re-evaluate **only** `RunQuery` stages, and only for the handlers it is resuming;
- issue **no** host call, ship **no** notification, and apply **no** op a re-run would duplicate;
- refuse to resume a handler whose derived replay safety (§7.4) is `unsafe`, unless the host has been
  explicitly configured to accept re-execution — in which case it MUST record that it did.

**The two are not interchangeable.** State reconstructed under resume-replay may differ from the state
the session originally reached, because the underlying data moved. A host MUST NOT present one as the
other, and a consumer MUST NOT compare a document produced under one mode with one produced under the
other and treat a difference as a defect.

### 7.3 A retry is not a replay

A caller that loses a response and re-sends the same event produces a **new invocation** — correctly,
because a loop cannot tell a retry from a genuine second click. Deduplicating one is §8's subject, not
this section's.

### 7.4 Replay safety is DERIVED from the declared form

A handler's replay safety MUST be computed from its stage list. It is never declared, because a
declaration is free to drift from the thing it describes and this one need not exist at all.

Three values, and the middle one is the point:

| Value | When | Why |
|---|---|---|
| `safe` | every stage is provably re-runnable | see the table below |
| `unsafe` | any stage provably reaches outside — a `HostCall`, or a `Notify` | re-running duplicates a message or an external commitment |
| `unknown` | anything the walk cannot decide | reported as undecided, never guessed |

A stage is provably re-runnable when it is:

- a `RunQuery` — it reads;
- an `ApplyOps` or `EmitPatch` whose every op is **absolutely addressed** (an op naming a target
  node, not a position relative to a sibling count);
- a compute stage whose action is a **chain every action of which is itself provably re-runnable by
  this list**, a state write with a **literal** value, or a **call** (which is inert inside a stage —
  §4.2 — so re-running it changes nothing).

The recursion into a chain is load-bearing and is why that clause is not simply "a chain". A chain
composes the very actions this list decides, so an unconditional reading would classify a chain
holding a binding-valued write as `safe` — contradicting the next paragraph, and doing it by the
route that is hardest to notice, since the offending write is one level down from the stage the walk
reports on. The composition is the same one the ranking below states: a chain is as strong as its
weakest action permits.

A compute stage whose state write takes its value from a binding is `unknown`: the value is resolved
at dispatch against a store that has moved. An op whose addressing this walk cannot decide is
`unknown`.

`unsafe` dominates `unknown`, which dominates `safe`: a handler's classification is the strongest
claim its weakest stage permits.

**Only a proof is a finding.** `safe` is a claim, so it requires proof; `unknown` is the honest answer
where none is available, and a host MUST NOT round it to either neighbour. A classification that fired
on ordinary correct handlers would be one people learn to scroll past, and then the real ones go with it.

### 7.5 What a classification carries besides its value

A classification says a handler cannot be resumed. It does not say what to change, and a host
reporting only the value leaves every reader to re-walk the stage list by hand to find out. So a
classification is accompanied by **reasons**, derived on exactly the terms the classification itself
is: from the declared form, never from a declaration, and never quoting a string the document
supplied (§4.4).

A reason is a **stage ordinal** and a **defect token**.

The ordinal addresses a stage by position, because a stage carries no identifier of its own and a
position is the only locator that names one without echoing something the document chose. The token
is drawn from a **closed** vocabulary of six, and the split between them is the same one §7.4's
table makes:

| Token | What the walk demonstrated | Grade it forces |
|---|---|---|
| `opaque-host-call` | the stage is a `HostCall` — it commits somewhere this host does not own | `unsafe` |
| `outbound-notification` | the stage is a `Notify` — a second run ships the message a second time | `unsafe` |
| `relative-addressing` | an op is not provably absolutely addressed: it names no target node, so the walk cannot tell an absolute address from a position relative to a sibling count | `unknown` |
| `non-literal-write` | a state write takes its value from a binding, resolved at dispatch against a store that has moved | `unknown` |
| `undecidable-action` | an action arm this walk does not decide | `unknown` |
| `unencodable-op` | an op does not render at all, so there is no document to read an address off | `unknown` |

The two `unsafe` tokens are the only PROOFS; the other four are places the walk could not decide, and
§7.4's rule that `unknown` is never rounded to a neighbour is precisely the statement that those four
are not the first two in a weaker form.

**The classification MUST be derived from the reasons rather than walked a second time.** No reason is
the only proof of `safe`; otherwise the value is the strongest grade any reason forces, by the ranking
§7.4 states. A host computing the two independently would hold two copies of one rule, free to drift —
and a reason that disagrees with the verdict it explains is worse than no reason at all, because it is
read as the explanation of it.

**Reasons within one stage are distinct; reasons in different stages are not merged.** An `ApplyOps`
carrying nine relatively-addressed ops is one fact about that stage, not nine. Two stages carrying the
same defect are two places to go and look, and both are reported.

**Five of the six are exhibited by a document; the sixth is not, and that is a property of the
vocabulary rather than a gap in it.** `unencodable-op` names a defect in the READER's own rendering of
a referenced position (§3) — reached when a host holds an op it cannot put back on the wire. A
conformant document cannot produce it: an op that does not decode is refused as
`malformed-referenced-value` (Appendix A) before any classification runs, so the arm is reachable only
from a value a host constructed itself. The corpus therefore pins the other five against handler
vectors and leaves this one to a host's own suite, which is the only place it can be reached at all.
Saying so here is the point: an arm certified nowhere and an arm certified elsewhere are different
facts, and only the first is a hole.

---

## 8. Idempotency

### 8.1 The decision

**An idempotency key is carried on the INVOCATION, it is OPTIONAL, and exactly-once is FORGONE and
said so.**

Three arguments decide it, and none of them is about taste.

**It cannot ride the program.** A program is untrusted. A program-declared key would let an emitted
tree choose the deduplication identity of a privileged handler's invocation — collapsing two distinct
invocations onto one key, or making every invocation unique, at will. That is the same puncture as a
program choosing where a handler's answer lands (§9.5), and it is refused for the same reason.

**It cannot be mandatory.** A key on every invocation is a per-event cost on the overwhelmingly common
case — an interaction nobody retries — and, decisively, **a mandatory key would not buy exactly-once
either.** §6.4's residual is structural: a perform-phase failure leaves a prefix of host calls run, and
no record keyed on the invocation can un-run them or safely re-run them. Mandating the key would pay a
cost on every invocation for a guarantee the algebra still cannot make.

**It cannot be absent.** Without a key nothing can offer deduplication at all, and a host whose handlers
settle payments needs to. So the key exists, and a host that offers deduplication demands it.

### 8.2 What the key buys: at-most-once ADMISSION

This is the whole of the guarantee, and it is deliberately weaker than exactly-once.

A host that admits idempotency keys MUST:

1. **Scope a key to `(host, session, endpoint)`.** A key is opaque to this algebra and MUST NOT be
   interpreted, parsed or compared across endpoints, sessions or hosts. Two different endpoints
   presented with the same key are two different invocations.
2. **Record the outcome document (§6.3) against the key** when a handler run completes, whether or not
   it committed.
3. **Refuse to PLAN a second run for a key it has already recorded**, and return the recorded outcome
   document verbatim instead. "Already recorded" is decided before the plan phase begins, so the second
   invocation performs nothing at all.
4. **Never treat a key as authorising re-execution.** Where the recorded outcome carries a
   `PerformFailed` (§6.4), the residual is exactly what a re-run must not repeat; returning the
   recorded outcome is the required behaviour, and re-running is forbidden.

A host that offers no deduplication MUST ignore the key rather than refusing the invocation, and MUST
NOT report at-most-once admission it does not provide.

### 8.3 The invocation document

```json
{"$type":"Invocation","endpoint":"/api/settle","idempotencyKey":"a3f1c0e8-2b7d-4c11-9f6a-0d2e5b8c4417","nodeId":"btn-settle"}
```

| Member | Required | Type | Meaning |
|---|---|---|---|
| `$type` | yes | `"Invocation"` | the document discriminator |
| `endpoint` | yes | string, non-empty | the entry point named — the one string that always comes off the wire |
| `idempotencyKey` | no | string, 1–128 characters | §8.2's key |
| `nodeId` | yes | string, non-empty | the originating node, threaded to the evaluator exactly as every placement threads it |

An empty `idempotencyKey` MUST be refused (`empty-idempotency-key`) rather than read as absent — the
two are different claims, and only omission means "this caller is not asking for deduplication". A key
longer than 128 characters MUST be refused (`idempotency-key-too-long`); an unbounded key is an
unbounded index entry on an untrusted input.

### 8.4 What this forecloses

- **Exactly-once delivery of host effects**, at any layer, by any key. Said out loud so that no host
  advertises it.
- **A program-supplied key.** A future case for one is a case for a declared, validated parameter
  vocabulary with a host-side schema (§9.5), and it has to be made in this document — it cannot arrive
  as a member a host quietly starts honouring.
- **Cross-host key portability.** A key means something only inside the host that recorded it.

---

## 9. The cross-layer reference

### 9.1 One identity, named — never a position

The layers here refer to one another **by name**. A composition surface names a program; a program
names an entry point; a program names a query slot; a reader names the same query slot. In every
direction the reference is a declared identifier, and in no direction does either side take a type
dependency on the other. That is what lets the layers version, ship and be specified separately.

### 9.2 A composition surface names a program

A composition surface that carries a program holds it in an **opaque slot** under the namespaced
identity:

| | |
|---|---|
| **Namespace** | `fuaran.program` |
| **Kind** | `logic-tree` |
| **Rendered identity** | `fuaran.program/logic-tree` |

The slot declares **one required member** — a bounded reference identifier — and **one optional
member**, the content address of what that identifier names. It is a leaf — it holds no children —
and it carries **no inline body, no evaluation hint and no semantics tag**.

```json
{"$type":"LogicTreeRef","ref":"orders-logic","slot":"fuaran.program/logic-tree"}
```

| Member | Required | Type | Meaning |
|---|---|---|---|
| `$type` | yes | `"LogicTreeRef"` | the document discriminator |
| `hash` | no | `sha256:` followed by 64 lower-case hex digits | the content address of the demand projection published under `ref` (below) |
| `ref` | yes | string, 1–256 characters | the identifier under which the host holds the program |
| `slot` | yes | `"fuaran.program/logic-tree"` | the slot identity, verbatim |

A `slot` naming anything else MUST be refused (`unknown-slot`). **Any other member MUST be refused**
(`undeclared-member`) — and note the mechanism: the opaqueness is enforced by what the declaration
**omits**, not by a list of forbidden member names. Because the declaration states the only members
there are, an inline body, an evaluation hint or an interpretation tag is refused as undeclared,
including the ones nobody has thought of yet. A blocklist could only ever cover the ones somebody had.

**`hash` widens the declaration; it does not weaken the mechanism.** One member joined the list, so
exactly one shape of document that was refused before is admitted now. Everything else is refused for
the reason it always was — including, and this is the point of stating it, the shapes nobody has
thought of yet. A reader that answered a widening by relaxing the rule rather than by extending the
declaration would have given up the whole property in exchange for one member.

**What `hash` addresses, and why it can be specified here.** A host that publishes what a program can
ask of it publishes a **demand projection** — a document enumerating the effects, capabilities, host
functions and channels a program and its reachable handlers can ever reach. That document's *shape* is
deliberately not governed by this specification (§11.2), and this member does not govern it either: an
address over a document's **bytes** is well defined without decomposing them. What is specified here is
the algorithm and the rendering — **SHA-256 (FIPS 180-4) over the published document's bytes exactly as
published**, rendered as `sha256:` followed by the 64-character lower-case hex digest — and the two
obligations below. That is the whole of it, and it is why this can land while §11.2 stays open.

The algorithm's rendering, on a preimage chosen because it governs nothing: the two-byte document `{}`
addresses as `sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`. That vector is
what the corpus pins, and it is deliberately not a demand projection — an example whose bytes came from
an ungoverned document would smuggle that document's shape into this text by illustration.

```json
{"$type":"LogicTreeRef","hash":"sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a","ref":"orders-logic","slot":"fuaran.program/logic-tree"}
```

**Absent means UNPINNED, and that is a posture rather than a default.** A reference carrying no `hash`
makes no claim about which published document it was composed against, and a reader MUST treat it
exactly as it treated every reference before this member existed — resolve it if it can, and fall back
to whatever conservative answer it already had if it cannot. It MUST NOT be read as "any document will
do", because a reference that declined to say is a different fact from one that said "anything".

**The two obligations.**

1. A `hash` whose value is not `sha256:` followed by 64 lower-case hex digits MUST be refused
   (`malformed-content-address`) from the document alone. Present-and-unreadable is a broken record,
   not a posture, and collapsing it into absence would let a malformed value buy the unpinned
   treatment — which is the one reading that makes pinning worth defeating.
2. A reader that holds **both** a pinned reference and the document published under its `ref` MUST
   refuse the pair when the recomputed address does not equal the declared one
   (`content-address-mismatch`). Refusal rather than silence, and refusal rather than preferring
   either side: a stale reference and a tampered document are indistinguishable from here, and the
   answer to both is the same.

Obligation 2 is the only rule in this document a reader cannot discharge against the corpus, because
the addressed document is not in it — the same shape as §7.5's `unencodable-op`, which no conformant
document can reach either. It is stated here rather than omitted because a host that holds both
documents is exactly the host the rule is for, and a rule that existed only where it could be tested
would not be the rule anyone needs.

**On the two renderings of one identity.** The identity is the `(namespace, kind)` **pair**. This
specification renders it joined with `/`. A host whose own registry keys the same pair with a
different separator MUST derive **both** renderings from the pair rather than storing either string
twice — two renderings of one datum is a fact to pin, and an unpinned fact is one a later reader
"fixes" in whichever direction they happened to read first.

### 9.3 A program names an entry point

A program names a handler through the action algebra's call arm, whose `endpoint` is the registration
key §4.1 defines. That string is **the one value in this subsystem that always comes off the wire**,
which is why §6.5 forbids echoing it and why an unregistered endpoint produces a memberless diagnostic.

Resolution is **one hop and that is structural**: a stage's call action is inert (§4.2), so no handler
can reach another. There is no cycle to guard against, which is the same fact that keeps the algebra
total.

### 9.4 A program names a query slot

A read effect's `name` (§5.1) is a query slot identifier. A reader in a composition surface names the
**same** identifier to read the landed table. The two sides agree on a string; neither knows anything
else about the other.

**The reader's expectation is declared by the fields it already has.** A chart names its axes; a grid
column names its field; a grid names its row key. Those are ordinary wire-carried strings, and they are
the whole of what a rendering vocabulary reads from a row — so a host checking a read effect against its
readers **harvests** that existing declaration rather than minting a second one beside it. A second
declaration would be two mechanisms for one job, and the new one would be the one free to drift, because
nothing renders it.

Where a reader's projection is not wire-carried, the harvested expectation is a **lower bound**, and a
host MUST report it as such rather than completing it with a guess.

### 9.5 The handler declares where its results land; a program-declared result target is REFUSED

The action algebra's call arm can carry a result target. A handler's stages name their own landing
slots (§5.1). **Two mechanisms for one job is one too many, the handler's wins, and the program's is
not merely ignored:** a conformant host MUST **refuse** a call action that declares a result target, at
every placement, with a diagnostic naming neither the endpoint nor the target
(`tree-declared-result-target`).

**The rule is the same at every subject (§10.7), and it is read through the subject's own call.** What
counts as a call declaring a result target is the subject's to say, because only its vocabulary spells
a call: the referenced subject's is a `Call` carrying `into`, the toy's is a `Ring` whose `targeted` is
`true`. What is not the subject's to say is where the refusal happens. In a **handler document**, a
compute stage's action that declares a result target — at any depth the action's composition shapes
(§10.6: a sequence, a selection's arms, a repeat's body, an iteration's body) reach — is refused by the
**codec**, as `tree-declared-result-target`, at every subject; a host decides it from the subject's
declared reading of the call, never from one subject's spelling. In a **program**, the tree's own codec
is another specification's, which may admit the shape, so a program carrying one is refused by the
**fold**, when the call runs, at every subject (§10.6's `Ring` row). A value that is not a call of the
subject's vocabulary at all is refused for that first: a toy `Ring` carrying an `into` it does not
declare is `undeclared-member` (§2.9), before any reading of the action is made.

Two things decide it.

**The program is untrusted; the handler is not.** This whole design rests on a session's capability
envelope being fixed before any generated program arrives — a host registers the handlers, a program can
only name one. A program-declared landing slot punctures exactly that: it lets an emitted program choose
where a privileged handler's answer is written, including into a slot some other part of it reads. The
host-reserved-namespace check (§4.3) would then be guarding a wire-carried string rather than a
host-declared one, which is a materially weaker position for the same code.

**And it is under-expressive besides.** A handler has several stages that land results — a read names
its slot, each host call names its own — so one target on a call action cannot address them. The
mechanism that lost could not have done the job even if it were safe.

The reusability a program-declared target would buy is recoverable and cheap: **a host registers the
same stage list under two names with different landing slots.** That is a host act, which is where every
other capability decision here already sits.

**Refusal rather than silence is the load-bearing half.** Ignoring the target would leave an author
believing an answer lands somewhere it never does, and would leave a retired mechanism looking alive to
anyone reading the vocabulary.

**What it forecloses.** A program cannot parameterise a handler at all — not its landing slot, and by
the same argument not anything else it might later have carried. A future case for program-supplied
parameters is a case for a declared, validated parameter vocabulary with a host-side schema, and it has
to be made here.

---

## 10. Conformance

**Two claims are certified here and they are not the same claim.** The six shape families certify a
**codec**: that the documents this specification introduces round-trip, and that ill-formed ones are
refused for the reason they are ill-formed. The driver-semantics family certifies a **loop**: that a
host implementing §6 produces, step by step, what the corpus records. An implementation may make the
first claim without the second — a great many will, and §10.2 says why that is a position rather
than a shortfall. The reverse is not available, since a loop reads documents.

### 10.1 Codec conformance — the six shape families

An implementation conforms by:

1. **Round-tripping** every `round-trip` vector its role requires: decode it, re-encode it, and produce
   byte-identical output.
2. **Refusing** every `reject` vector, **for the class the manifest names**. A refusal for some other
   reason is not a pass: it would let a reader certify by being broken in a convenient way.
3. **Reproducing** every derived value a vector declares — today, the `replaySafety` a handler vector
   carries (§7.4) and the `replayReasons` beside it (§7.5), both recomputed from the decoded document
   rather than read off the manifest. The reasons are the finer expectation and are the one that
   discriminates *within* a grade: two defects of the same grade produce the same `replaySafety`, so a
   reader that confused them would pass a corpus pinning only the value.
4. **Implementing §6** — the two phases, the atomicity unit, the staging boundary, and §6.4's
   impossible-outcome rule.
5. **Implementing §7.2's mode obligations** and naming the mode it is in.
6. **Asserting two things about its own harness**, without which a green result means nothing: that the
   number of vectors it ran equals the number the manifest enumerates for its role and subject (§10.7),
   and that a mutated fixture makes it go red.

[`wire-fixtures/manifest.json`](wire-fixtures/manifest.json) is the **authoritative enumeration** of
families, vectors, scenario families and scenarios. Do not count any of them from a prose description
of the corpus, including this one — counts drift, and a manifest cannot.

**Dispatch on a vector's `document`, not on its family.** A family is an organising grouping; the
`document` member names the top-level document a vector actually is. The two coincide everywhere except
in `cross-layer`, which deliberately carries a **handler** document to pin §9.5 — a rule about a call
action can only be demonstrated by a document that contains one. A harness that dispatched on family
would feed that vector to the wrong reader, and it might then pass by refusing for an unrelated reason,
which is the failure naming the class exists to prevent. (The toy families of §10.7 are named for
their documents with a prefix — `toy-handler` carries handler documents, and so on — and a vector's
`subject`, not its family, says which vocabulary its referenced positions hold.)

Codec conformance is **whole-corpus**, not profile-scoped. Every shape family is a facet of one thing —
a host that runs handlers necessarily reaches all six — so partitioning would produce claims nobody
needs. It is whole-corpus **for the subject a host certifies at** (§10.7): a subject is a choice of
vocabulary for the referenced positions, not a profile of the families, and a host at either subject
reaches all six. That statement is about the six; §10.2 is the one place this specification admits a scope
question, and it admits it because the answer there is genuinely different.

### 10.2 The bounded-path declaration

The driver-semantics family asserts what a bounded program **loop** does, which is a stronger claim
than round-tripping a document and is not one every implementation is in a position to make. So it is
**opt-in by declaration**:

**A host MUST declare that it implements the bounded path (§6) before this family applies to it.** A
host that only decodes, only encodes, records, relays or validates these documents is **out of scope**
for the family — **not non-conformant**. Those are different verdicts, and collapsing them would be
wrong in both directions: it would report a gateway as failing a loop it never claimed to run, and it
would leave "conformant" unable to distinguish a host that *runs* programs from one that merely
*carries* them.

The declaration is a claim about an implementation, not a member on a wire, and this document
specifies no encoding for it — a conformance claim is a sentence somebody writes down, and the honest
form of this one names both halves: *this implementation implements the bounded path, and it
reproduces the driver-semantics family*. The first half without the second is untested; the second
without the first is not a well-formed statement.

Every scenario records the obligation it presumes. Today they all presume the same one, and the field
exists anyway so that a scenario presuming something else — a replay mode (§7.2), an idempotency store
(§8.2) — **enumerates rather than renumbers**.

### 10.3 The driver-semantics family

A **scenario** is a tree, an event script, and the per-step trace a conformant loop produces from
them. It is a directory of three documents rather than a single one, and that shape is also the
discriminator: a codec harness cannot mistake a scenario for a vector, the manifest keeps the two in
separate enumerations, and a scenario's kind is one no vector may spell.

| File | What it is |
|---|---|
| `tree.json` | the interface tree the scenario starts from — a referenced document (§3) |
| `events.json` | the ordered event script; each entry names a node, an event and a payload |
| `expectation.json` | the trace: one entry per step, **index 0 being the state before any event** |

A step entry declares three required members, one optional member, and no others — §2.9 governs here
for the same reason it governs a wire document:

| Member | Required | Type | Meaning |
|---|---|---|---|
| `tree` | yes | object | the resolved tree at this step, **embedded as a document** |
| `effects` | yes | array of string | the client effects (§5.2) this step emitted, in order, **as emitted** |
| `refused` | yes | boolean | whether the loop refused **the event** that produced this step — never an action within it (§10.5) |
| `denials` | no | array of denial (§5.3) | the effects this host's performer seam declined, in order, **embedded as documents** |

`denials` follows `refused`, which is where a member added to a shape that already had three belongs:
appending leaves every trace recorded before it byte-identical, so the member's arrival is visible in
the traces that use it and nowhere else.

**`denials` is where §5.5's "refusal is conformant; silence is not" becomes falsifiable.** Until it
existed this family could see what a fold *emitted* and not what a host *performed*, so a host that
dropped an effect silently and one that declined it audibly produced the same trace — which is the
one pair §5.5 says a conformance corpus must be able to tell apart. A denial is not an effect that
did not happen: the effect is still recorded in `effects`, because the fold reached that arm with
those values, and the denial beside it records that the host declined to perform it. The two members
answer §10.4's two different questions and neither substitutes for the other.

**Its absence means NONE-OR-UNOBSERVED, and that is stated rather than left to be assumed.** A trace
with no `denials` member says only that this scenario records no denial for that step; it is *not* a
claim that nothing was declined. Two readings are therefore both conformant and both honest — a host
whose policy declined nothing, and a host whose scenario runner does not consult a performer seam at
all. A host in the second position MUST record the absence rather than manufacture an empty array:
an omitted member and an empty one are two spellings of one fact everywhere else in this document,
and here they would be two spellings of *different* facts, which is worse. So an empty `denials`
array is a positive claim — this step was observed and nothing was declined — and a host that cannot
make that claim omits the member.

**Which policy a scenario presumes is NAMED, never carried.** A denial is a fact about a host's
policy, and a corpus that carried a policy as data would be specifying one — so a scenario whose
trace records denials declares a policy **name** in its manifest entry, `hostPolicy`, and every host
running that scenario **constructs** the policy that name denotes. An unrecognised name MUST fail
rather than fall back: a silent fallback to a permissive host would report a scenario the host could
not evaluate as one it passed, which is the vacuous green this family's harness obligations exist to
refuse. A scenario declaring no `hostPolicy` presumes nothing about the seam, and a host runs it as
it always did.

One name is registered by this document:

| `hostPolicy` | What a host constructs |
|---|---|
| `local-egress-only` | every arm of §5.2 registered and permitted by the discriminator gate; a destination that leaves the host's own origin declined, with the denial naming that origin. `Absent` and same-origin destinations are permitted. |

Registering a second name is an additive change (§11.1) and enumerates rather than renumbers, exactly
as §10.2's `requires` does for the obligation a scenario presumes.

**Three comparison rules, and they are deliberately different.**

**The tree is compared SEMANTICALLY.** It is recorded as an embedded *document*, never as a string of
one implementation's bytes, and a host certifies by decoding it with its own decoder and comparing
against its own resolved tree — however it spells either. This document does not own the tree
vocabulary (§3), so it cannot hold a host to bytes produced by an encoder it does not specify: a host
whose canonical form differs from the one that generated a scenario is not thereby wrong, and a
family that said otherwise would be certifying an encoder under the name of a loop.

**The effects are compared BYTE-for-byte.** Their envelope *is* specified here — it is §5.2's
enumerated exception — and the corpus's client-effect vectors already require a conformant host to
reproduce those bytes exactly, so there is no host freedom left to respect. An effect is therefore
recorded as a **string whose contents are the document's own bytes**. Embedding it as an object
instead would licence any JSON writer to re-order its members Ordinally, which is precisely the
"correction" §5.2 refuses — applied in the one place nobody would notice it had happened. The
asymmetry between the two rules is not an inconsistency: it is the two vocabularies' ownership, made
operational.

**The denials are compared as DOCUMENTS THIS SPECIFICATION OWNS — decoded, then compared.** §5.3
declares the denial's shape and §2 governs its encoding without exception, so unlike a tree there is
no host encoder to respect, and unlike an effect there is no legacy envelope to preserve. A denial is
therefore recorded as an **embedded object**, and a host certifies by decoding it into its own denial
vocabulary and comparing that against what its seam produced. Decoding rather than diffing bytes is
what makes the comparison assert something a byte diff cannot: that the host **recognises** the
vocabulary. A recorded denial naming an arm outside §5.3, or carrying `origin` on `Unregistered`,
MUST therefore make the harness fail rather than be passed through as an opaque value — a trace
carrying a member somebody expected to be honoured is worse than one that fails to load.

**First-divergence reporting is an obligation, not a convenience.** A harness MUST compare step by
step and report the **first** step at which it diverges, naming the step index and which member
differed. Reporting only a final-state mismatch is non-conformant reporting even where the verdict
happens to be right: a fold that diverges at step 2 and re-converges at step 5 passes a final-state
comparison, and that shape is the principal defect this family exists to catch. Step 0 is there for
the same reason — a host that resolved the initial tree differently has already diverged, and must be
told so at step 0 rather than at the first event, where it would read as a fold bug.

**A harness's own obligations** are the ones §10.1 point 6 states for vectors, and for the same
reason: the number of scenarios it ran equals the number the manifest enumerates, and a mutated trace
makes it go red.

### 10.4 What a driver-semantics claim does and does not assert

It asserts that the loop folds the same way — same resolved tree, same effects reached with the same
values in the same order, same refusals, at every step.

It asserts **nothing** about what a host did with an effect it **performed**. §5.5 is what makes that
a decision rather than an omission: performance is host-defined, refusal is conformant, and only
silence is not. It asserts nothing about transport, about rendering, or about the mechanism by which
a step's tree becomes visible to anyone.

**What a recorded `denials` adds is narrower than it looks, and the boundary is worth stating.** It
asserts that a host constructing the scenario's named `hostPolicy` (§10.3) declines exactly those
capabilities, for those grounds, at those steps — the *reporting* half of §5.5, which was the half no
trace could previously see. It still asserts nothing about performance: a host that permits an effect
and a host that permits it and then does nothing with it produce the same trace, and are both
conformant. And it asserts nothing about a policy the scenario did not name — a host's own default
policy is its own business, which is exactly why the scenario names one rather than presuming it.

**The three members are not redundant, and the pairs a reader might expect to collapse are the point.**
An effect present with a denial beside it is *reached and declined*; an effect present with none is
*reached and permitted*; an effect absent with `refused: false` is an action that declined inside an
admitted event (§10.5) and never reached the seam at all; and `refused: true` is the event never
having been admitted. Four distinct facts, and a host that collapsed any two of them into one would
pass a coarser family while misreporting a surface to whoever reads its record.

### 10.5 The fold, where §6 does not reach

§6 governs handler execution, and §1 deliberately does not respecify the action algebra. Between the
two sits the thing the family in §10.3 actually records: a **loop** folding an untrusted event
against a store, at a placement where no handler runs. Its rules were nowhere, and a second
implementation built from this text alone found seven places it had to choose. Each is decided here,
because a scenario that pins a choice the text never made is pinning one implementation's accident —
and a host reading the text can reach a different answer, pass every one-event scenario, and still be
wrong on the corpus.

**Re-resolution is against the FIXED tree the program started from, never the previous step's
output.** A host MUST re-resolve the base tree against the store as the interpreter left it. Folding
each step's substitutions into the next step's input makes an earlier step's resolution
unrecoverable: a binding one step happened to resolve is gone from the tree the next step reads, so
a later write to the same key can no longer reach it, and the store stops being the only thing
carrying state. The two readings are indistinguishable on a one-event scenario — which is exactly
why the corpus carries a multi-event one (`fixed-base-reresolution`), whose second step diverges
under the other reading and is the only place it ever would.

**A re-resolution floor exists, it is not all-or-nothing, and the corpus is where it is
enumerated.** Not every kind a tree carries re-resolves its bindings: the covered set is the
state-reactive display, input and layout slots, and a kind outside it passes through with its
bindings intact, so a write inside one is not yet visible. That much is normative, and it is the
part a host cannot derive — an implementation reading only this text resolves everything or nothing,
and both fail the corpus. What is **not** stated here is the membership, deliberately: the kinds
belong to the tree wire specification (§3), so a table here would version this document against
another document's growth and would be a second place for the floor to be written down, which is the
drift the manifest-not-prose rule (§10.1) already refuses. The driver-semantics scenarios enumerate
it instead, positively and negatively — a scenario recording a **pass-through** is as normative as
one recording a resolution, and is the harder half to obtain. So: a host that resolves a kind the
corpus records as passing through, or passes through one it records as resolving, is
non-conformant. For a kind no scenario reaches, the floor is the host's own and it MUST declare it —
silence is the §5.5 failure applied one level in. Widening a floor therefore moves a recorded
expectation in the same change-set (§11.1's fifth artefact, read in the direction that matters here:
the corpus catching up with a host), never a behaviour that changes quietly.

*The losing reading, and what it would have cost.* Declaring the floor wholly host-defined was
available and is cheaper to write: no obligation, and the two `coverage-floor-*` scenarios narrowed
to "this is what one host does". It would have made the family unable to say what it exists to say.
Two hosts with different floors produce different resolved trees for the same tree and the same
event, and §10.3 compares trees — semantically, but a binding substituted and a binding left intact
are not the same document under any comparison. The family would have been left asserting a fold
whose principal observable was excluded from it.

**`refused` is EVENT-level, and an action-level refusal is an ABSENT effect.** A step's `refused` is
true when the loop declined to fold the event at all — the trust boundary rejected it, or a resource
budget did — and in that case the step emits nothing and the tree is unchanged. It is **not** set
when the event folded and something inside it declined: a state write under the reserved namespace
(§4.3), a navigation destination that fails the floor below, a host call nothing answers. Those
produce a step that is `refused: false`, carries no effect for the arm that declined, and is
otherwise an ordinary step. The distinction is the difference between *this event was not admitted*
and *this event was admitted and part of it did nothing*, and a host that collapsed them would
report a rejected surface where there was an inert one. The corpus pins the second case in
`refused-navigate`, whose step is `refused: false` with no effect — a reading a host could otherwise
defensibly have taken the other way, and failed the scenario for it.

**A legitimate event that resolves to no action is not a refusal either**, and is the same shape:
the event was admitted, the fold found nothing to run, and the step is `refused: false` with no
effect and an unchanged tree. This reaches further than it looks. A control whose behaviour is
carried in a **handler slot** — a closure — has nothing on the wire to resolve, because the wire
cannot carry a closure and a decoder MUST NOT invent one; so an event on such a control resolves to
no action **at every host**, and the step is inert. Whether a decoder erases the slot entirely or
substitutes an inert placeholder is a host's own business, on §5.5's line: the two mechanisms are
observationally identical here, and only the observable is certified. What a host MUST NOT do is
recover behaviour from such a slot, which would make an event effectful on one host and inert on
another with nothing on the wire distinguishing them.

**An unsafe navigation destination is refused rather than neutered — and the safety predicate is
NOT host-defined.** It is already normative, in the tree wire specification: that document states a
renderer URL floor as an obligation, names the navigation destination among the slots it governs,
and fixes it down to the normalisation. §3 is what carries it here — a destination is a referenced
value, this document does not re-spell one, and a floor stated there is in force wherever that
vocabulary's values are interpreted. So there was never a predicate for this document to invent; the
finding was that nothing said which document owned it.

What this document does add is the **response**, which the other one does not cover: it prescribes
what a *rendering* host emits for a rejected URL, and a bounded loop emits no markup. A loop MUST
therefore decline the action — no effect for that arm, `refused` unchanged per the rule above — and
MUST NOT emit the effect with a substituted destination. A neutered destination is the worse of the
two failures available: the effect reached, the surface navigated somewhere, and the author's record
says the navigation they wrote succeeded.

A host whose own policy is **stricter** than the floor — an origin allowlist, a scheme narrower than
the floor accepts — is not thereby non-conformant, but it MUST declare the divergence rather than
discover it. That is §5.5's rule with the emphasis moved: a stricter policy is a policy decision this
document does not forbid, and applying it silently converts a policy into an unexplained divergence
in the one record that compares hosts.

**Where the extra strictness lives decides what the corpus sees, and the two places are not
interchangeable.** A policy applied *in the fold* changes which effect the step reached, so it moves
the `effects` member and the host fails any scenario the strictness touches. A policy applied at the
**performer seam** — after the fold, where §5.4's registration and gate live — leaves the fold
identical and shows up in `denials` instead. Both are legitimate; only the second is
*expressible* here, because only the second lets two hosts with different policies still agree on
what the loop did. A scenario that wants to pin a strict host therefore names its policy
(`hostPolicy`, §10.3) and records the denial, rather than recording a fold that only a strict host
produces. A host applying the strictness in the fold instead has taken a different position on where
the boundary sits; it must say so, and it will diverge here on `effects` rather than on `denials`,
which is the right place for that disagreement to surface.

*The losing reading, and what it would have cost.* The finding proposed declaring the predicate
host-defined and restating the family's assertion to say the scenario pins *this corpus's* predicate
only. It is a coherent position and it is the wrong one, because it was reached from this document
alone: the floor was already written down, in the document that owns the value. Adopting the
host-defined reading would have created a second, weaker home for a settled rule — and, worse, would
have made the family's byte-for-byte effect comparison (§10.3) formally unfalsifiable on exactly the
arm most worth comparing, since any divergence could be answered with "different predicate,
conformant". The cost of the reading taken is that a host with a stricter policy must say so; the
cost of the one refused was that no host would ever have had to.

**A question is TWO events, and its answer is correlated.** A referenced action that asks the reader
a question — the one arm the tree wire specification's lowering table marks as a round trip — is not
folded in one event, because the answer is not in the event that asks. A conformant loop MUST fold it
as follows.

1. **The gesture asks.** The fold reaches the question and emits §5.2's `Confirm` effect, its `token`
   the question's **address**: the node the event addresses, `#`, and the question's structural path
   inside that node's action — chain positions and continuation names joined by `.`, the empty path
   naming the action itself. No continuation runs. Everything else the gesture reaches folds as it
   always does, in order, around the question. A prompt that resolves to no text, or to nothing but
   white space, asks nothing: the arm declines, on the reasoning of the navigation floor above — a
   question with no subject is not one a reader can answer.
2. **The answer is an event.** It is the originating event re-delivered with `confirmToken` (a
   string) and `confirmAccepted` (a boolean), as §5.2 states, and it passes the whole trust boundary
   again. An event carrying both is an answer; an event carrying less is the gesture it otherwise is.
3. **The answer runs ONE continuation, as a selection.** The loop folds the addressed question as the
   bounded core's `Choose`, the answer its entry: `true` takes the accepting continuation and `false`
   the declining one, or the empty sequence where the author declared none. The selected continuation
   meets the dispatch gate **on its own** before it folds, so a question cannot smuggle an action a
   host would refuse; a continuation the gate refuses refuses the event.
4. **The question is PENDING, and pending is host state.** A loop holds the tokens a gesture asked
   until each is answered or withdrawn, and holds them where the tree can neither write nor read
   them: no binding resolves a pending token and no write the tree makes can create one. Where a
   host keeps them is its own business; that the tree cannot reach them is not.
5. **The correlation rule.** An answer is admitted only when its token is pending AND still addresses
   a question in the node's action as it resolves now; admitting it consumes the token. **Any other
   admitted event withdraws every pending question** — the reader moved on, and a late answer must not
   act on a store they have since changed. An answer naming a token that is not pending (never asked,
   already answered, or withdrawn), or one that addresses nothing, is **refused as an event**
   (`refused: true`, nothing folded) — and, like every refused event, it changes nothing, pending
   questions included.

The corpus pins the rule in four scenarios: `confirm-answer-yes` and `confirm-answer-no` (the two
selections, the second with the question inside a chain), `confirm-withdrawn` (an event that is not
the answer withdraws the question, so the late answer is refused) and `confirm-duplicate-answer` (an
answer consumes its question, so the second is refused). An answer is untrusted exactly as §5.2 says:
the rule above makes a replayed or forged answer inert, and it makes nothing an authorisation that
was not one — a hostile surface answers yes without asking anyone, and the gate the continuation meets
is the only control. What the loop's demanded projection reports for a question is its `Confirm`
effect AND the union of both continuations: which one runs is the reader's answer, which no
projection can see.

**What stays host-defined here.** The mechanism by which a slot's erasure is modelled; a floor for
kinds no scenario reaches, subject to the declaration above; a policy stricter than the URL floor,
subject to the same; and everything §5.5 already places outside a claim — what a host *does* with an
effect it reached. None of those is silence: each is a fact a host states about itself, which is the
line this section shares with §5.5 and §10.2.

### 10.6 A second scenario family, over a witness this document owns

The family in §10.3 records its trees in the **tree wire specification's** vocabulary, which this
document references and does not own (§3). So a host could certify the bounded loop only by also
implementing that vocabulary, and the only evidence that the loop is a property of the *algebra* —
rather than of the one domain it was first written for — was that the same host's code happened to
be generic. This section adds a second scenario family, **`driver-semantics-toy`**, over a **toy
witness** this document specifies outright: small enough to state in full, filling every axis the
algebra reads (a tree to walk, actions over a keyed store, an op stream that edits the tree), and
naming every shape the fold distinguishes. A host may certify the bounded path over the toy alone;
a host that certifies both families has shown the loop twice, over two vocabularies that share
nothing but the algebra (fuaran#2011).

The toy is a **specification subject, not a product**. Nothing ships it, and no rendering surface
reads it. It exists so that a conformance claim about the loop can be made, and checked, without a
second specification in the room.

#### The documents

Unlike a UI tree, every toy document is **owned here**, so §2 governs it without exception: members
Ordinal, `$type` discriminators, no `null`, and no undeclared member. One consequence the corpus
enforces: a toy scenario's `tree.json` **is its canonical bytes**, as a wire vector is, and a step's
tree is compared as a document this specification owns — decoded, re-encoded canonically, compared
— exactly as §10.3 compares a denial. The schemas are
[`toy-tree`](schemas/v2/toy-tree.schema.json), [`toy-op`](schemas/v2/toy-op.schema.json),
[`toy-state`](schemas/v2/toy-state.schema.json) and [`toy-effect`](schemas/v2/toy-effect.schema.json).

| Document | Shape |
|---|---|
| **node** | `children` (nodes), `handlers` (`{action, event}` in order), `id`, `label` (an expression). All four always present; an empty list renders `[]`. |
| **expression** | `Const {value}` · `Read {key}` · `Fail {message}` · `Missing {}` · `Hole {placeholder}` |
| **action** | `Seq {actions}` · `Put {key, value?, from?}` · `Ring {endpoint, targeted}` · `Need {condition}` · `Pick {entry, whenTrue, whenFalse, exit?}` · `Times {bound, body}` · `ForEach {collection, placeholder, body}` · `Beep {volume}` · `Hush {}` |
| **bound** | a non-negative integer (literal), or `Parameter {count, lo, hi}` |
| **op** | `Relabel {label, target}` |
| **state** | an object, a member per store key; a repeated key is refused |
| **effect** | `{"kind":"Sound","nodeId":…,"volume":…}`, recorded as a string |

A node id and an op target are **identifiers** — letters, digits, `.`, `_` and `-` — because the
effect's emitter writes a node id into its bytes. The **effect adopts §5.2's envelope** rather than
§2's: a `kind` discriminator and the emitter's member order, recorded in a trace as the emitted
bytes. That is not a second exception to §2 but the first one reused: a step's effects are compared
byte-for-byte as emitted (§10.3), and a toy effect is a client effect of the toy's rendering surface,
which has exactly one arm. Its three members happen to be in Ordinal order; the checker holds them to
the emitter's order, which is the rule.

A `Ring`'s answer is a **closure** in any host's model and has no wire form. A decoder MUST NOT invent
one; §10.5's handler-slot rule applies to it unchanged.

#### What a toy loop does

The fold is the **algebra's**, not this document's (§1); what this section adds is which of the
algebra's shapes each toy case *is*, and the toy's own leaf, expression and resolution rules.

| Toy case | The algebra's shape | What the corpus pins |
|---|---|---|
| `Seq` | sequence | members in order, each seeing the store the last left; a halt stops the rest |
| `Put` | assign | writes `value`, else `from` resolved; an unresolved or errored `from`, or neither member, writes nothing and the event continues; a key under `sys.` is refused and the event continues |
| `Ring` | call | answered by a placement that has a handler for the endpoint, in place; otherwise nothing; `targeted: true` in a program is refused (§9.5) and the event continues; in a handler document the codec refuses it (§9.5, §10.7) |
| `Need` | require | the boolean `true` continues; any other value, an unresolved and an errored condition **halt** |
| `Pick` | choose | `entry` resolving to `true` takes `whenTrue`, any other value `whenFalse`; unresolved or errored halts before either arm; `exit` is the algebra's reversibility assertion and is not exercised by this family |
| `Times` | repeat | a literal runs the body that many times; a parameter whose count resolves to an integer within `[lo, hi]` runs it that many times, and otherwise halts before the body |
| `ForEach` | each | the body once per element, in order, with the element substituted for every `Hole` naming the placeholder; a halt in one element stops the rest |
| `Beep` | leaf | emits `Sound` at the event's node; volume above 10 is refused and the event continues; while the store holds `"muted": true` it declines |
| `Hush` | leaf | declines, documented |

An **expression** resolves as: `Const` to its value; `Read` to the stored value, or unresolved where
the key is absent; `Fail` to an error carrying its message; `Missing` to unresolved; and an
unsubstituted `Hole` to an error naming the placeholder — reachable only through a program the
scope check should have refused before its first step.

**Re-resolution** replaces every node's label that resolves with a `Const` of its value and leaves
every other label as written. The toy's floor (§10.5) is therefore **total**: it has one kind, and
that kind re-resolves.

**The transport is the toy's own, and it is the whole of what a host adds.** An event naming no node
of the tree is **refused at the event** — the trust boundary — and an event the node carries no
handler for is **admitted and inert**, which §10.5 says is not a refusal. The toy reads no payload.
The budget is the algebra's: a cascade priced over the per-interaction ceiling refuses the event
before anything runs. Everything between the gate and the step — the fold, re-resolution of the
FIXED base tree, the effects — is the algebra's, which is the point of the family.

#### A second obligation: `handler-loop`

§10.2 records the obligation every scenario presumes so that a scenario presuming something else
**enumerates rather than renumbers**. This family is the first to need that: besides `bounded-loop`
scenarios, it carries **`handler-loop`** scenarios, which presume a placement that **answers** a call
with a host-registered handler and runs it under §6. A placement with no handler registry — a
rendering surface, a client loop — is **out of scope** for a handler-loop scenario, not
non-conformant, on exactly §10.2's terms.

Handlers are named, never carried, for §10.3's reason about policies: a scenario declares
**`hostHandlers`** in its manifest entry, and every host running it **constructs** what the name
denotes. An unrecognised name MUST fail rather than fall back to no handlers. One name is registered:

| `hostHandlers` | What a host constructs |
|---|---|
| `toy-relabel` | a gate admitting every capability; an argument policy on `ApplyOps` admitting the `target` `title` and nothing else; host functions `audit`, which answers, and `decline`, which declines; ops applied **in memory**, committed with the plan; and three handlers, below |

| Endpoint | Stages, in order |
|---|---|
| `/handlers/relabel` | `Compute` `Seq [Put status "relabelled", Beep 2]` · `ApplyOps [Relabel title "Relabelled"]` · `HostCall audit {"note":"relabel"}` |
| `/handlers/off-list` | `Compute` `Put status "attempted"` · `ApplyOps [Relabel footer "Moved"]` |
| `/handlers/declined` | `Compute` `Put status "staged"` · `ApplyOps [Relabel title "Never"]` · `HostCall decline {}` |

What the three pin is what §6 says and no trace of the UI family could show: the **op channel**
committing an edit the next re-resolution makes visible; the **argument-policy gate** refusing an op
stage while planning, so that nothing the handler planned commits — the store write before it
included; and a **staged perform** failing after a complete plan, with the same result, because the
handler is the unit of atomicity. A call nested in a sequence is answered **in place**, seeing the
write before it and seen by the write after it. At such a placement the base tree is the tree as the
last committed op stage left it, and re-resolution is still against that base — never against a
previous step's resolved output (§10.5).

#### Where the two families do not correspond

The families cover the same loop and not the same vocabulary, and the gaps are recorded here per
family rather than papered over with a scenario that merely resembles its counterpart.

| UI scenario | Toy counterpart, or why there is none |
|---|---|
| `chain-folds`, `setstate-rebinds` | `sequence-folds` |
| `fixed-base-reresolution` | `fixed-base-reresolution` |
| `closure-free-effects`, `server-handler-call` | `closure-free-call` |
| `nested-handler-call` | `handler-nested-call` — at a placement that answers; the UI family pins only the unanswered reading |
| `documented-no-ops` | `leaf-refusal-continues` (`Hush`) |
| `coverage-floor-passthrough` | **none.** The toy has one kind and it re-resolves; a pass-through needs a kind outside the floor, and inventing one would pin a floor nobody needs |
| `coverage-floor-reactive` | **none distinct.** Every toy scenario records a resolution |
| `refused-navigate`, `refused-destination` | **none.** Both are about a destination — the URL floor and an egress policy's denial — and the toy's one effect names no destination. The toy family registers **no host policy**, and a toy step records no `denials` |

| Toy scenario | UI counterpart, or why there is none |
|---|---|
| `choose-takes-an-arm`, `repeat-bounded`, `each-over-literal`, `require-halts` | **none.** The UI action vocabulary views no action as a branch, a repeat, an iteration or a guard: the UI tier branches in the tree and repeats through bindings |
| `leaf-refusal-continues` | **partial** — `documented-no-ops` pins the decline; no UI scenario pins a refused leaf or a reserved-namespace write |
| `refused-event`, `budget-refusal` | **none.** No UI scenario records an event-level refusal |
| `handler-op-channel`, `handler-argument-policy`, `handler-staged-perform`, `handler-nested-call` | **none in the corpus.** The UI family's handler reading is asserted by a host's own suite, never recorded — the obligation that would make it recordable is this section's |

**No emitter runs either scenario family**, and that is §11.1's account rather than a new gap: the
three emitters re-derive wire *documents*, and a trace is the output of a loop. The checker
(`wire-fixtures/check-scenarios.mjs`) reads both families' shapes — the toy's member by member,
since this document owns them — and the hosts certify their content.

### 10.7 The codec families at the toy subject

§10.6 certifies the **loop** over the toy witness; this section certifies the **codec** over it. The
handler, server-effect, client-effect and outcome documents are this specification's own envelopes,
but §3's positions inside them carry another specification's vocabulary — so until this section a
host whose domain was not the tree wire specification's could make no codec claim at all: every
vector it might have run carried that vocabulary's actions, ops or client effects. The corpus
therefore carries those four families a second time, at a second **subject**, with the toy's
vocabulary in the referenced positions. A host may certify the codec at the toy subject alone
(fuaran#2017).

#### The subject

A vector carrying `"subject": "toy"` is at the **toy subject**. A vector carrying no `subject` is at
the **referenced subject** — the tree wire specification's vocabulary — which is what every vector
meant before this section and still means: no existing vector, digest or expectation moved. The
member is closed, and `toy` is its only value.

The toy vectors sit in four families of their own: `toy-handler`, `toy-server-effect`,
`toy-client-effect` and `toy-outcome`. A family is at **one** subject — every vector in it names the
same subject, or none — so a harness can select by family as well as by subject. Dispatch is still
on `document` (§10.1): a toy vector's `document` is `handler`, `server-effect`, `client-effect` or
`outcome`, exactly as its counterpart's is. The subject says which vocabulary the reader is handed;
the document says which reader.

#### What the toy puts in a referenced position

| Position (§3) | At the toy subject |
|---|---|
| a compute stage's `action` | a toy **action** (§10.6) |
| an op-bearing effect's `ops`, and an outcome's `patches` | the toy **op**, `Relabel` |
| a read effect's `source` and `pipeline` | unchanged — the substrate's vocabulary, which is the tree specification's at neither subject |
| a `Bounded` diagnostic's `diagnostic` | **nothing.** The toy specifies no diagnostic vocabulary, so no toy outcome carries a `Bounded` diagnostic |
| a client effect (§5.2) | the toy's one effect, `Sound`, in §5.2's envelope: `kind`, `nodeId`, `volume`, in that order (§10.6) |

Four refusals follow from the toy being **owned** here rather than referenced. None is a new rule;
each is an existing rule read at this subject.

1. A value in a referenced position that is not a case of the toy vocabulary — an action or an op of
   the other subject's, say — is refused as `malformed-referenced-value`: it does not decode under the
   vocabulary that position holds at this subject.
2. A toy action, expression or op carrying a member the toy does not declare is refused as
   `undeclared-member`. §2.9 reaches the toy directly, because the toy's shapes are declared here.
3. The host-reserved namespace a landing slot is checked against (§4.3) is the namespace of the
   subject's store, and the toy store's is `sys.` (§10.6). A host call landing under it is refused as
   `host-reserved-landing-slot` — the class names a defect in the handler document, however the
   subject spells its namespace.
4. A toy call declaring a result target — a `Ring` whose `targeted` is `true` — in a handler
   document is refused as `tree-declared-result-target`, by the codec, at any depth the toy's
   composition shapes reach (§9.5). The class and the point are the referenced subject's: §9.5's
   rule is read through the subject's own call, so the toy's spelling of a target is what the codec
   reads here, as `into` on a `Call` is what it reads there (fuaran#2019).

#### Derived values at the toy subject

§7.4's list of provably re-runnable actions is written in the referenced vocabulary's cases — a
chain, a state write, a call. The toy's cases are the algebra's shapes (§10.6), and two of those
shapes are ones the referenced vocabulary never views an action as, so a toy handler's
`replaySafety` and `replayReasons` are derived from this table rather than from §7.4's spellings.
§7.5's rules hold unchanged: the reasons are the primitive, distinct within a stage and never merged
across stages, and the verdict is the strongest grade any reason forces.

| Toy case | Shape | What it contributes to its stage's reasons |
|---|---|---|
| `Ring` | call | nothing — a call is inert inside a stage (§4.2) |
| `Seq` | sequence | the distinct union of its members' |
| `Put` | assign | nothing with a literal `value`; `non-literal-write` with a `from`, whatever expression `from` holds |
| `Need` | require | `undecidable-action` — whether a guard over a moved store holds on a re-run is not decidable from the declared form |
| `Pick` | choose | `undecidable-action`, then the distinct union of both arms' — either arm may be the one that re-runs |
| `Times` | repeat | a literal bound: its body's, since it re-runs the same body the same number of times. A `Parameter` bound: `undecidable-action`, then its body's |
| `ForEach` | each | its body's, once per element of its literal collection — substituting an element for a `Hole` changes no case — so the body's where the collection has an element, and nothing where it is empty |
| `Beep`, `Hush` | leaf | `undecidable-action` |
| `Relabel`, in an op stage | edit | nothing — it names its target absolutely |

The corpus's toy handler vectors each carry at most one distinct token per stage, so no vector pins
the order of two tokens within one stage.

**Four of §7.5's six tokens are reachable from a toy document.** `unencodable-op` is not, for the
reason it is reachable from no document at all. `relative-addressing` is not either, and that is a
property of the toy rather than a gap: its one op names its target, and a `Relabel` whose `target` is
not an identifier does not decode, so nothing reaches the classification without an absolute
address. The manifest check holds the `toy-handler` family to discriminating the four, and asserts
that no toy vector carries either of the other two.

#### The vocabulary-free documents

The **invocation** and **logic-tree-ref** documents carry no referenced vocabulary, so the corpus
does not carry them twice. The manifest names them in a top-level `vocabularyFreeDocuments` list,
and a host at the toy subject certifies every vector that carries no `subject` and whose `document`
is on it, as it stands. A document on the list carries no toy vector. Selection is by `document`,
never by family: the `cross-layer` family's reference vectors are vocabulary-free, and its handler
vector is not.

So a host computes the run count of §10.1 point 6 from the manifest, per subject:

| A host at | runs |
|---|---|
| the referenced subject | every vector carrying no `subject` |
| the toy subject | every vector carrying `"subject": "toy"`, and every vector carrying no `subject` whose `document` is in `vocabularyFreeDocuments` |

The list is over **documents**, and is not refined vector by vector. A handler with no stages, and
an outcome whose one diagnostic is the memberless `HandlerUnregistered`, also carry no vocabulary of
either subject — but a handler document and an outcome document in general do, so the toy families
carry their own (`toy-handler/minimal`, `toy-outcome/unregistered`) rather than the list naming two
documents that are vocabulary-free only sometimes.

#### Where the two subjects do not correspond

Recorded per family, as §10.6 records the scenario families, rather than papered over with a vector
that merely resembles its counterpart. A referenced vector not listed has a toy counterpart of the
same name.

| Referenced vector | Toy counterpart, or why there is none |
|---|---|
| `handler/chain-bound-write` | `toy-handler/seq-bound-write` |
| `handler/undecidable-action` | `toy-handler/undecidable-action` — a leaf, `Beep`, standing for an action the walk does not decide |
| `handler/reject-host-reserved-slot` | `toy-handler/reject-reserved-slot`, under `sys.` |
| `handler/relative-op` | **none.** `relative-addressing` is not reachable from a toy document (above) |
| `client-effect/navigate`, `navigate-target`, `push-state`, `write-to-clipboard`, `focus`, `download`, `read-file-body`, `print`, `confirm` | **none.** Arms of the referenced client vocabulary. The toy's is closed at `Sound`, which `toy-client-effect/sound` covers |
| `client-effect/control-characters` | **none.** The short escapes need a string member able to hold a control character, and the toy effect's one string member is a node id — an identifier (§10.6) |
| `client-effect/reject-navigate-target`, `reject-print-member` | **none.** Each is a rule about an arm the toy does not have |
| `client-effect/reject-confirm-missing-token` | `toy-client-effect/reject-missing-member` |
| `outcome/denied` | `toy-outcome/denied`, **without** the `Bounded` diagnostic — the toy has no diagnostic vocabulary for that position |
| `cross-layer/reject-result-target` | `toy-handler/reject-result-target` — the toy's call declares its target in its required `targeted`, and the codec refuses `targeted: true` for the same class (refusal 4 above). Its call sits inside a sequence, so the vector also pins that the codec reads through the composition shapes. In a **program** the refusal stays in the fold at both subjects (§9.5), which `driver-semantics-toy/closure-free-call` pins |
| `invocation/*`, and `cross-layer`'s `logic-tree-ref` vectors | **not duplicated** — vocabulary-free, certified at both subjects as they stand |

| Toy vector | Referenced counterpart, or why there is none |
|---|---|
| `toy-handler/guard`, `choose`, `repeat-literal`, `repeat-parameter`, `each-literal` | **none.** The referenced vocabulary views no action as a guard, a branch, a repeat or an iteration (§10.6) |
| `toy-handler/reject-foreign-action`, `toy-server-effect/reject-foreign-op`, `toy-outcome/reject-foreign-patch` | **none.** Each puts the other subject's value in a toy position; the corpus carries no referenced vector refused as `malformed-referenced-value`, because such a vector would have to spell a value the tree wire specification decides is malformed |
| `toy-handler/reject-ring-into` | **none.** An undeclared member inside the action, which at the referenced subject is the tree wire specification's rule to state. Its class is `undeclared-member` and not `tree-declared-result-target`: `into` is not the toy's spelling of a target, and §2.9 refuses the member before any reading of the action is made (§9.5) |

One refusal the toy effect could plausibly be asked for is deliberately **not** a vector: a `Sound`
carrying a member beyond its three. §5.2 names the class for an extra member arm by arm, and §10.6
names none for `Sound`, so the class is not decided by this text — and a corpus does not pin a class
the text has not chosen.

---

## 11. Versioning, forward coupling, and what is left open

### 11.1 Forward coupling — five artefacts, one change-set

A change to any specified member, ordering, encoding, refusal class or derived value updates, **in the
same change-set**:

1. this document,
2. the schemas in [`schemas/`](schemas/),
3. **all three** emitters — the resident [`wire-fixtures/emit.mjs`](wire-fixtures/emit.mjs), which
   mints the bytes; the independently written
   [`wire-fixtures/emit-independent.mjs`](wire-fixtures/emit-independent.mjs); and
   [`wire-fixtures/emit-ordinal.py`](wire-fixtures/emit-ordinal.py), which derives the same documents
   in a language whose native string comparison is **not** rule 3's ordering, so that rule is
   implemented deliberately somewhere rather than inherited from a runtime everywhere. Each must be
   brought to the same answer *by this text* rather than by reading another,
4. the vectors and digests in [`wire-fixtures/manifest.json`](wire-fixtures/manifest.json),
5. **the codec of every host that certifies against this corpus.**

The fifth is the one that is easy to leave out and the one that makes the other four mean something: a
corpus the hosts have not caught up with is a specification of nothing. [`CONTRIBUTING.md`](CONTRIBUTING.md)
states the rule operationally.

**Why the third artefact is two files.** A wire document can be re-derived from a model by anyone who
has read this text — so the corpus carries **two** emitters, written separately from this document
and never from each other, and treats a disagreement as a defect in the text. That covers both
directions a defect can point: either emitter disagreeing with the committed bytes says the text
stopped determining them, and the two disagreeing with *each other* says the text never determined
them and the corpus recorded whichever answer was written first. A rule this document leaves open is
one a single emitter cannot fail — it is free to close the rule its own way, and the fixtures it
mints then pin the choice as though the text had made it.

**For the driver-semantics family the third artefact is a different thing, and honestly so.** A step
trace is the *output of a bounded loop*, and re-deriving one would mean writing a second
interpreter. So what sits beside the scenarios is a checker of their **shape** — the step arithmetic
of §10.3, the member discipline, the as-emitted envelope — and not a reproducer of their content.
Their content is certified by the hosts. That is the ordinary situation for a behavioural claim, and
it is written down here rather than left to be discovered by whoever first expects an emitter.

**For the toy family (§10.6) the five artefacts are the toy's own.** This document's §10.6, the four
`toy-*` schemas, the scenario checker in the emitters' place, the manifest's enumeration — including
its `hostHandlers` names — and the toy codec and loop of every host that certifies the family. A
change to a toy case, member or rule moves all five in one change-set, exactly as a change to a wire
document does; a toy trace is recorded only when every placement the recording host has in scope
agrees on it.

**For the toy codec families (§10.7) the third artefact is the three emitters again**, exactly as for
the referenced subject: those vectors are wire documents, not traces, so each emitter reproduces them
from unstamped models — and derives a toy handler's classification from §10.7's table of the toy's
cases, never from §7.4's spellings of the referenced vocabulary's.

**Versioning.** Adding an arm to a closed vocabulary, adding a required member, or changing a member's
type or ordering is a **breaking** change and takes a new format version. Adding an optional member,
adding a refusal class for a document that was already ill-formed, or adding a vector is **additive**.
This specification is format version **2**; `manifest.json` carries `formatVersion`.

**Version 2 adds `Print` and `Confirm` to §5.2's closed client-effect vocabulary, and adds nothing
else.** Every version-1 document is a version-2 document, byte-identical and meaning what it always
meant: no member, ordering, encoding, refusal class or derived value moved, and no existing arm was
touched. The widening is breaking in one direction only — a version-2 document may name an arm a
version-1 reader has no rule for.

**The format version is a property of THIS CORPUS, not of any document, and a reader is versioned by
which corpus it certifies against.** No document in any family carries a version member and none is
being given one. That is worth stating plainly, because the natural expectation — that a reader
inspects a document's version and refuses by it — is not available here and cannot be made available
cheaply: putting a version member on these documents would change every byte on a live wire, which is
the migration §11.3 defers, and taking it in the same document that first pinned those bytes is the
decision §5.2 already declined once.

**So a version-1 reader handed a version-2 document refuses it BY ARM — `unknown-effect-arm` — and
that is correct rather than a gap.** The refusal is the right one: the reader has genuinely met an
arm outside the vocabulary it implements, which is exactly what that class says. What it does not
carry is the more useful diagnosis, *you are a version behind*, and no reader can derive that from a
document that does not say so. The honest place for that diagnosis is the corpus a host declares
conformance against, which does say so, and it is why §11.1's fifth artefact is the codec of every
certifying host: the coupling between a version and its readers is enforced by the change-set, never
by a member a reader could inspect at run time. A host that must tell its operator which version it
implements states it about ITSELF, from the corpus it certified against — never inferred from a
document in front of it.

**A version-2 reader accepts every version-1 document unchanged**, which is the other half and the
one that costs nothing: the six original arms are untouched, so nothing a surface has ever been
handed stops decoding.

**§5.3's `origin` and §10.3's `denials` are ADDITIVE by that rule, and the arithmetic is worth
showing** — because the change they serve had a breaking shape available and it was declined. Both
are optional members; no arm was added to the denial vocabulary, no required member appeared, and no
existing member's type or order moved. The breaking alternative was a third denial arm — a
`DestinationRefused` beside the two — which reads more naturally and would have cost a format
version and left every existing reader refusing a document it had no reason to refuse. It was
declined because the fact it would have carried is already the fact `GateRefused` carries: the host
has the capability and refused this use of it. What was genuinely missing was *which use*, and a
member is the honest shape for that. The `capability`-and-nothing-else rule is untouched, and every
document and trace recorded before this change is byte-identical after it.

### 11.2 Open, and recorded as open

- **The `Bounded` diagnostic pass-through (§6.5).** A shared-evaluator diagnostic may quote a value
  taken from the action it describes, which §4.4 makes wire-carried. The obligation §6.5 states —
  redact, or satisfy yourself the evaluator quotes nothing wire-carried — is a host-side mitigation,
  not a closure. Closing it means tightening a rule that belongs to the action algebra's own
  specification, which is a change to make there rather than here.
- **Concurrency.** Two sessions running handlers against the same domain state is a question about where
  durable state actually lives. It is a hosting concern today and may not stay one. Nothing here answers
  it, and nothing here should be read as implying it is safe.
- **A later stage reading an earlier host call's result** is foreclosed by §6.2 and is a real handler
  shape. The workaround — two handlers, or one host function doing both halves — is stated, not
  celebrated. A vocabulary that supported it without reintroducing the atomicity gap does not exist yet.
- **A by-reference source has no schema at specification time.** A host that wires named sources SHOULD
  declare their schemas at registration, beside the resolver that serves the rows. An undeclared source
  degrades to "unknown" — reported, never guessed, and never a refusal, because refusing a handler over a
  schema nobody declared would punish a host for not answering a question it was never asked. This
  document does not specify the declaration's shape.
- **A reader whose projection transforms a query slot** — a binding that derives client-side from a
  landed table — has an expectation that is §9.4's harvest composed with its own pipeline. That
  composition is not attempted.
- **The demanded-effect projection.** A host can already emit a self-describing document enumerating
  what a program and its reachable handlers can ever ask for. It is deliberately **not** a family here:
  its envelope predates this specification (a `kind`/`version` pair rather than `$type`, and
  declaration-ordered members), so specifying it would either mean writing a second exception into §2 or
  breaking a shipped document in the act of first pinning it. Governing it — and unifying its envelope —
  is future work, on the same terms as §11.3.

  **§9.2's `hash` addresses that document without governing it, and the distinction is worth keeping
  sharp.** An address is over bytes; governance is over shape. So a composition can now pin *which*
  projection it was composed against — which is what makes a stale reference a compose-time defect
  rather than something the run-time floor catches later — while what a projection *is* remains open.
  What the address does NOT buy is the thing governance would: two hosts can agree byte-for-byte on a
  document neither of them reads the same way. That is the residue, and it is why this bullet stays
  open rather than being narrowed to "the envelope".
_(**CLOSED at format version 2.** The two client-effect arms a conformant emitter shipped while §5.2
declared only six — a payload-free print instruction and a confirmation — are declared arms seven and
eight, with their members, refusal classes, derived values and, for the confirmation, its answer's
return path. The divergence this list recorded no longer exists, and the entry is struck rather than
edited so that the list holds only what is still open.)_

**One question a reader may expect to find on this list is answered rather than open**, and is named
here so that its absence is not read as an omission: whether a handler declares the runtime guarantees
— delivery, idempotency, restart visibility — of the host that runs it. It does not, deliberately, and
**§6.6** states the four arguments and the cost. It is recorded there rather than as a bullet here
because a decision taken and a question left are different artefacts, and filing the first among the
second would leave the list reading as though an answer were still owed.

### 11.3 Deliberately deferred

- **Unifying the client-effect envelope (§5.2) with §2's discipline.** A migration, not a tidy-up.
- **A bounded loop written from this specification alone.** The driver-semantics family is not a
  one-host claim: a second host, in another language, reproduces every scenario §10.3 enumerates. It
  was written from this text, and each place the text did not determine its fold was recorded rather
  than silently inherited, and is now a ruling in §10 rather than either host's habit. That shows
  more than that the family is *implementable* — two loops agree on it. It still does not triangulate
  it as the two-emitter arrangement triangulates the document families, because the second loop was
  written with the first in view: each question the text left open was answered by consulting the
  first implementation, so a misreading the two share would pass both. What stays deferred is a loop
  written against §6 and §10 alone, without reference to any existing implementation, by an author
  who wrote none of them. Deferred rather than attempted, because a further interpreter written by an
  author who already knows the answers would supply the appearance of independence and none of the
  substance.
- **A generic instantiation of this algebra over a domain other than the one that motivated it.** The
  shapes here are the first instantiation's; a second one is what would show which parts are the algebra
  and which are its first host's assumptions. Generalising before that would bake one witness's
  assumptions into the contract, which is the failure the deferral exists to avoid.
  §10.6 is a step towards it and not the thing itself: the toy witness instantiates the LOOP over a
  second domain, which shows the fold, re-resolution and handler execution are the algebra's rather
  than the tree vocabulary's. §10.7 carries this document's codec families over the same domain, which
  shows the handler, effect and outcome envelopes read a second vocabulary in their referenced
  positions — but the envelopes themselves, and the server-effect vocabulary, are still the first
  instantiation's shapes at both subjects.

---

## Appendix A — refusal classes

Every class a `reject` vector may name. A conformant reader refuses **for the named class**.

| Class | Raised when |
|---|---|
| `null-member` | any member's value is the JSON token `null` (§2.5) |
| `undeclared-member` | a document carries a member this specification does not declare (§2.9) — including a self-declared `capability` (§5.1), an inline body in a reference (§9.2), and an `origin` on a denial that never consulted a destination (§5.3) |
| `missing-member` | a required member is absent |
| `unknown-stage-kind` | a stage's `$type` is neither `Compute` nor `Effect` (§4.2) |
| `unknown-effect-arm` | an effect names an arm outside the closed vocabulary (§5.1, §5.2) |
| `empty-name` / `name-too-long` | a handler's registration key is empty or over 256 characters (§4.1) |
| `host-reserved-landing-slot` | a host call's landing slot is under `host.` (§4.3) — at the toy subject, under the toy store's `sys.` (§10.7) |
| `empty-idempotency-key` | an idempotency key is present and empty (§8.3) |
| `idempotency-key-too-long` | an idempotency key exceeds 128 characters (§8.3) |
| `impossible-outcome` | an uncommitted outcome reports work performed without a `PerformFailed` (§6.4) |
| `endpoint-echoed` | an unregistered-handler diagnostic carries a member (§6.5) |
| `unknown-slot` | a reference names a slot other than `fuaran.program/logic-tree` (§9.2) |
| `malformed-content-address` | a reference's `hash` is not `sha256:` followed by 64 lower-case hex digits (§9.2) |
| `content-address-mismatch` | a pinned reference and the document published under its `ref` are both held, and the recomputed address differs from the declared one (§9.2). **Not corpus-reachable** — the addressed document is not in this corpus, so no `reject` vector can name this class; it is certified by a host that holds both documents, exactly as `unencodable-op` (§7.5) is certified by a host's own suite |
| `tree-declared-result-target` | a call action declares a result target (§9.5) |
| `malformed-referenced-value` | a referenced position (§3) does not decode under its own vocabulary. A distinct class because the defect is in the other specification's document, not this one's, and a reader that reported it as a shape error here would send the reporter to the wrong text |
