#Requires -Version 7.0
<#
.SYNOPSIS
    The gate for the program wire specification home.

.DESCRIPTION
    Five checks, in order, each answering a question the others cannot:

      1. Each of the three emitters reproduces every round-trip document
         byte-for-byte from unstamped models, and re-derives every declared
         replaySafety from the same models. This is the specification checking
         that its own text still determines the bytes.

         Two of them are JavaScript and the third is not, deliberately. A rule
         the shared runtime supplies for free is one no comparison between two
         emitters in that runtime can test — and §2.3's Ordinal member ordering
         is exactly such a rule, because `<` on JavaScript strings already
         compares UTF-16 code units. The third emitter's language orders strings
         by code point, so it must implement Ordinal on purpose; it unit-tests
         its own comparator before emitting anything.

      2. The three emitters agree with EACH OTHER, vector by vector. Check 1
         asks whether each reproduces what is committed; this asks whether the
         text determines the bytes for people who read it separately. A rule the
         text leaves open is one every emitter can still satisfy — each its own
         way — against a corpus that only ever pinned the choice one of them
         made. So a divergence here is a defect in the TEXT until the text is
         shown to decide it, and never something to settle in whichever emitter
         looks wrong.

         Agreement is UNANIMITY, not a majority: two of the three share a
         runtime, so a two-against-one split says nothing about which is right.

      3. The manifest still describes the tree it sits in — every enumerated
         vector and scenario present, every present file enumerated, every
         digest matching its file, every refusal class drawn from Appendix A,
         every arm of both closed effect vocabularies covered by a round-trip
         vector, and every document-reachable arm of the replay-defect
         vocabulary (§7.5) discriminated by a handler vector carrying that
         token and no other — at each subject (§10.7): the toy vectors carry their
         subject, the vocabulary-free documents are not duplicated, and the toy's
         own effect and reachable defect tokens are covered on the same terms.
         The emitter cannot see any of this: it only ever
         looks at vectors the manifest already lists, so a fixture the manifest
         forgot is invisible to it and to every implementation certifying
         against it — and it derives a vector's reasons and its classification
         from one model, so it cannot notice the manifest asserting a pair that
         does not describe one handler.

      4. The driver-semantics scenarios still have the shape §10.3 gives them —
         one step per event plus the state before any of them, an embedded tree
         document rather than one host's bytes, and every recorded effect in
         the as-emitted envelope of §5.2 with its members in declaration order.
         Neither check above can see this: a scenario is not a wire document,
         and the index cannot tell a well-formed trace from a plausible one.
         Since fuaran#2011 it reads BOTH scenario families: the UI family's
         trees as referenced documents, and the toy family's (§10.6) member by
         member, its starting trees held to canonical bytes and its effects to
         the toy emitter's member order.

      5. Every checker can actually go red. A conformance gate is exactly the
         kind of code that passes by doing nothing, so each check is run once
         against a deliberately perturbed copy of the corpus and required to
         fail. The perturbation happens in a temporary directory; the real
         corpus is never modified.

    Everything runs on the two runtimes' standard libraries alone. There is no
    build step, no package manager, and nothing to install beyond Node and a
    Python 3 interpreter. `$env:PYTHON` names the latter where the usual
    spellings do not resolve to a real one.

    The Python leg is NOT skipped when its interpreter is missing — the gate
    fails and says so. A three-way agreement that quietly became a two-way one
    would report the same green while testing strictly less, which is the exact
    failure this arrangement exists to prevent.
#>
[CmdletBinding()]
param(
    [switch] $SkipEmitter,
    [switch] $SkipComparison,
    [switch] $SkipManifest,
    [switch] $SkipScenarios,
    [switch] $SkipSelfTest
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Invoke-Node {
    # node.exe is a real executable, not one of the PowerShell shims that
    # rebuild argv from the caller's command-line text — but resolve it
    # explicitly anyway so the launcher does not depend on which of several
    # installations happens to win on PATH.
    [CmdletBinding()]
    param([Parameter(ValueFromRemainingArguments = $true)] $Arguments)
    $cmd = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
    & $cmd.Source @Arguments
}

function Get-PythonPath {
    # The third emitter's interpreter. $env:PYTHON names it where the usual
    # spellings do not resolve — a machine may carry a stub named `python` that
    # is not an interpreter at all, so the candidates are TRIED rather than
    # merely found: each is asked for its version, and the first that answers
    # wins. A stub that launches an installer exits non-zero here and is passed
    # over instead of being handed the corpus.
    if ($env:PYTHON) { return $env:PYTHON }
    foreach ($candidate in @("python", "python3", "py")) {
        $cmd = Get-Command $candidate -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $cmd) { continue }
        & $cmd.Source "--version" *> $null
        if ($LASTEXITCODE -eq 0) { return $cmd.Source }
    }
    throw "no usable interpreter for the ordinal emitter — set PYTHON to name one. This leg is never skipped: a three-way agreement that quietly became a two-way one reports the same green while testing strictly less."
}

function Invoke-Python {
    [CmdletBinding()]
    param([Parameter(ValueFromRemainingArguments = $true)] $Arguments)
    & (Get-PythonPath) @Arguments
}

$fixtures = Join-Path $PSScriptRoot "wire-fixtures"
$failed = @()

function Step($name, [scriptblock] $body) {
    Write-Host ""
    Write-Host "== $name" -ForegroundColor Cyan
    & $body
    if ($LASTEXITCODE -ne 0) {
        $script:failed += $name
        Write-Host "   FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
    }
}

if (-not $SkipEmitter) {
    Step "resident emitter" { Invoke-Node (Join-Path $fixtures "emit.mjs") }
    Step "independent emitter" { Invoke-Node (Join-Path $fixtures "emit-independent.mjs") }
    # The third emitter, in another LANGUAGE rather than merely another file.
    # Both emitters above are JavaScript, where §2.3's Ordinal ordering is what
    # `<` on strings already does — so neither has to implement the rule on
    # purpose, and a corpus certified only by those two records that the rule
    # was obeyed, never that it was understood. This one orders by code point
    # natively and must build Ordinal deliberately; its own comparator unit
    # test runs first, because every document it emits presumes it.
    Step "ordinal emitter" { Invoke-Python (Join-Path $fixtures "emit-ordinal.py") }
}

if (-not $SkipComparison) {
    # The two emitters against EACH OTHER. Both legs above compare an emitter
    # with the committed bytes, which two emitters can pass separately while
    # disagreeing about a rule the text never decided — because the corpus
    # records only the choice one of them made. This is the leg that asks
    # whether the text determines the bytes for two readers rather than one.
    Step "emitter agreement" { Invoke-Node (Join-Path $fixtures "compare-emitters.mjs") }
}

if (-not $SkipManifest) {
    Step "manifest invariants" { Invoke-Node (Join-Path $fixtures "check-manifest.mjs") }
}

if (-not $SkipScenarios) {
    Step "driver-semantics scenarios" { Invoke-Node (Join-Path $fixtures "check-scenarios.mjs") }
}

if (-not $SkipSelfTest) {
    # Each perturbation targets what its checker is FOR, so a self-test passing
    # means that checker's actual purpose is live — not merely that it runs.
    #
    #   emitter        — a fixture's bytes change, so the reproduction diverges.
    #                    Run for ALL THREE emitters: an emitter that could not
    #                    go red would add a green line and no evidence.
    #   ordinal (a)    — the third emitter's §2.3 sort CALL SITE is replaced by
    #                    its language's native sort, the comparator itself left
    #                    in place and correct. The expected finding names one
    #                    vector, and that is the substance rather than a detail:
    #                    every other document's keys are ASCII, where the two
    #                    orderings agree, so only a vector straddling the
    #                    surrogate boundary can catch it. Before that vector
    #                    existed the rule was unfalsifiable in all three.
    #   ordinal (b)    — the comparator ITSELF is gutted, which its own unit test
    #                    catches before any document is emitted. Paired with (a)
    #                    on purpose: together they show the unit test and the
    #                    corpus catch different mistakes, rather than one riding
    #                    on the other.
    #   comparison (c) — the same native-sort perturbation, seen through the
    #                    agreement leg. It is invisible to every other check
    #                    here, because the two JavaScript emitters go on
    #                    agreeing with each other and with the committed bytes
    #                    throughout — which is the whole argument for a third
    #                    emitter in another language, made executable.
    #   comparison (a) — one emitter's model carries a different value, so the
    #                    two disagree on a vector. The plainest divergence there
    #                    is, and the one that proves the leg names the family
    #                    and the vector rather than merely exiting non-zero.
    #   comparison (b) — one emitter encodes the client-effect family with the
    #                    CANONICAL encoder. That is the perturbation worth
    #                    having here for the same reason the scenario check has
    #                    its own: it is not a corruption anybody would commit on
    #                    purpose, it is what a well-meaning second reader
    #                    produces by tidying §5.2's enumerated exception away,
    #                    and it is invisible to every other check in this file
    #                    because the committed bytes still match the emitter
    #                    that did not tidy.
    #   manifest       — a fixture is removed from the tree while still enumerated.
    #   scenarios (a)  — a step trace loses an entry, so it no longer carries one
    #                    step per event plus the state before any of them.
    #   scenarios (b)  — a denial records the URL where it must record the
    #                    ORIGIN. The one perturbation here that is a security
    #                    defect rather than a shape defect: the trace stays
    #                    well-formed and the audit trail now carries the payload
    #                    of the exfiltration attempt the refusal prevented.
    #   scenarios (c)  — an origin is recorded against the arm that consulted no
    #                    destination, which is a pairing no schema can state.
    #   scenarios (d)  — the corpus stops recording any denial at all, which
    #                    would leave a specified member no host ever produces or
    #                    reads — §5.5's silence, one level up.
    #   scenarios (e)  — a scenario names a host policy no host can construct.
    #   scenarios (f)  — a recorded effect's members are re-spelled in a different
    #                    order. That is the perturbation worth having, because it
    #                    is not a corruption anybody would commit on purpose: it
    #                    is what a well-meaning host produces by reaching for its
    #                    canonical encoder, and it would quietly erase the
    #                    specification's one enumerated envelope exception.
    #   scenarios (g)  — the same re-spelling, in the TOY family (§10.6), whose
    #                    effect adopts that envelope: the toy branch of the
    #                    checker is a separate rule and needs its own red.
    #   scenarios (h)  — a toy scenario's starting tree is re-serialised with
    #                    whitespace. A UI tree would pass — its bytes are
    #                    another specification's — but the toy is owned here, so
    #                    its file is held to canonical bytes.
    #   scenarios (i)  — a toy step's tree carries a member the toy vocabulary
    #                    does not declare, which the structural reader refuses.
    #
    # And the toy subject's codec families (§10.7), which are wire documents the
    # emitters reproduce rather than traces, so each check above has a toy half
    # that needs its own red:
    #
    #   toy emitter    — a toy fixture's bytes change, for each of the three.
    #   toy walk       — one emitter's toy classification stops reading a case
    #                    by its shape: the call read as undecided (resident,
    #                    ordinal), the literal repeat read as undecided
    #                    (independent). A toy handler's classification is the
    #                    toy's own walk, so a walk borrowed from the referenced
    #                    subject would fail exactly these.
    #   toy comparison — one emitter writes the toy effect's members in another
    #                    order: §5.2's envelope, reused by the toy, at the codec.
    #   toy manifest   — a toy arm loses its discriminating vector; the toy's
    #                    one client effect loses its only witness; the toy
    #                    vectors lose their subject; a toy vector carries a
    #                    token no toy document can exhibit; and a document with
    #                    toy copies is declared vocabulary-free.
    #
    # Each names the finding it EXPECTS, and a red for some other reason does not
    # pass — the same rule the corpus applies to a reject vector, applied to its
    # own gate. Without it a perturbation that also disturbs a digest would let a
    # dead check ride on a live one.
    #
    # All use a scratch copy. A self-test that edited the committed corpus would
    # be one interrupted run away from leaving the repository broken.
    $selfTests = @(
        @{
            Name    = "emitter goes red on an altered fixture"
            Script  = "emit.mjs"
            Expect  = "FAIL handler/minimal.json"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "handler/minimal.json"
                $bytes = [IO.File]::ReadAllBytes($target)
                # Flip one byte inside the document rather than appending: an
                # append could be mistaken for the trailing-newline check.
                $bytes[$bytes.Length - 2] = $bytes[$bytes.Length - 2] -bxor 0x01
                [IO.File]::WriteAllBytes($target, $bytes)
            }
        },
        @{
            Name    = "independent emitter goes red on an altered fixture"
            Script  = "emit-independent.mjs"
            Expect  = "FAIL handler/minimal.json"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "handler/minimal.json"
                $bytes = [IO.File]::ReadAllBytes($target)
                $bytes[$bytes.Length - 2] = $bytes[$bytes.Length - 2] -bxor 0x01
                [IO.File]::WriteAllBytes($target, $bytes)
            }
        },
        @{
            Name    = "ordinal emitter goes red on an altered fixture"
            Script  = "emit-ordinal.py"
            Interp  = "python"
            Expect  = "FAIL handler/minimal.json"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "handler/minimal.json"
                $bytes = [IO.File]::ReadAllBytes($target)
                $bytes[$bytes.Length - 2] = $bytes[$bytes.Length - 2] -bxor 0x01
                [IO.File]::WriteAllBytes($target, $bytes)
            }
        },
        @{
            Name    = "ordinal emitter goes red when its comparator is replaced by the language's own ordering"
            Script  = "emit-ordinal.py"
            Interp  = "python"
            # The finding names ONE vector, and that is the point rather than an
            # incidental detail: every other document's keys are ASCII, where
            # Ordinal and code-point ordering agree, so this perturbation can
            # only be caught by a vector whose keys straddle the surrogate
            # boundary. Before that vector existed the whole rule was
            # unfalsifiable — the naive sort would have reproduced the corpus
            # exactly, in all three emitters.
            Expect  = "FAIL server-effect/notify-ordinal-divergence.json"
            Perturb = {
                param($dir)
                # Perturb the CALL SITE, not the comparator: `ordinal_key` stays
                # in the file, correct and unit-tested, and simply stops being
                # used. That is the shape the mistake really takes — a tidy-up
                # that reaches for the language's own sort — and it is the shape
                # the file's own unit test cannot catch, which is why the corpus
                # has to.
                $target = Join-Path $dir "emit-ordinal.py"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace('keys.sort(key=ordinal_key)', 'keys.sort()')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "ordinal emitter's own comparator test goes red when Ordinal is delegated to the language"
            Script  = "emit-ordinal.py"
            Interp  = "python"
            # The other half of the pair above. Here the COMPARATOR itself is
            # gutted, which the unit test catches before a single document is
            # emitted — so the two perturbations prove the two checks are
            # independent rather than one riding on the other.
            Expect  = "was expected to expose the divergence"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "emit-ordinal.py"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace('return s.encode("utf-16-be")', 'return s')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "emitter comparison goes red when one emitter sorts open payload keys natively"
            Script  = "compare-emitters.mjs"
            # The three-way leg's reason for existing, proved. Two emitters
            # sharing a runtime cannot test what that runtime gives them; this
            # perturbation is invisible to every other check in this file,
            # because the two JavaScript emitters go on agreeing with each other
            # and with the committed bytes throughout.
            Expect  = "FAIL server-effect/notify-ordinal-divergence"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "emit-ordinal.py"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace('keys.sort(key=ordinal_key)', 'keys.sort()')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "emitter comparison goes red when the two emitters disagree on a value"
            Script  = "compare-emitters.mjs"
            Expect  = "FAIL cross-layer/logic-tree-ref"
            Perturb = {
                param($dir)
                # Perturb an EMITTER rather than a fixture: the comparison's
                # inputs are the two emitters, so a fixture edit is invisible to
                # it — both emitters would go on agreeing. A single reference
                # value is enough, and it keeps the expected finding to one
                # named vector.
                $target = Join-Path $dir "emit-independent.mjs"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace('"orders-logic"', '"orders-logik"')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "emitter comparison goes red when one emitter canonicalises the client-effect envelope"
            Script  = "compare-emitters.mjs"
            Expect  = "FAIL client-effect/download"
            Perturb = {
                param($dir)
                # Swap the call site, not the encoder body: the declaration-order
                # encoder stays in the file, unused — which is exactly the shape
                # of the mistake, since nothing about the code then LOOKS like
                # the exception was dropped.
                $target = Join-Path $dir "emit-independent.mjs"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace(
                    'encodeClientEffect(members)',
                    'encodeCanonical(Object.fromEntries(members))')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "emitter comparison goes red when one emitter drops the short escapes"
            Script  = "compare-emitters.mjs"
            Expect  = "FAIL client-effect/control-characters"
            Perturb = {
                param($dir)
                # Neutralise the short-escape branch in ONE emitter, so it
                # spells a tab numerically where the other spells it short.
                # Before a vector carried a control character this perturbation
                # would have changed nothing at all — which is the whole reason
                # the vector exists: the rule was implemented in both encoders
                # and exercised by neither.
                $target = Join-Path $dir "emit-independent.mjs"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace(
                    'else if (SHORT[ch]) out += SHORT[ch];',
                    'else if (false && SHORT[ch]) out += SHORT[ch];')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "emitter goes red when a declared reason moves to another stage"
            Script  = "emit.mjs"
            Expect  = "replayReasons"
            Perturb = {
                param($dir)
                # The ordinal is half of a reason, and a reason attributed to
                # the wrong stage is a locator pointing at the wrong place while
                # the verdict stays exactly right. Nothing that compares only
                # `replaySafety` can see it.
                $target = Join-Path $dir "manifest.json"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace(
                    "`"stage`": 0,`n          `"defect`": `"relative-addressing`"",
                    "`"stage`": 1,`n          `"defect`": `"relative-addressing`"")
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "manifest check goes red on a defect arm with no discriminating vector"
            Script  = "check-manifest.mjs"
            Expect  = "discriminates the relative-addressing arm"
            Perturb = {
                param($dir)
                # Hide an arm the way it would really go missing: not by
                # deleting a vector, but by a vector's reasons naming a
                # DIFFERENT token of the same grade. The verdict is unchanged,
                # the file is unchanged, both emitters would go on agreeing —
                # and the corpus has quietly stopped covering the arm. This is
                # the coverage pin's whole purpose, so it is proved rather than
                # assumed.
                $target = Join-Path $dir "manifest.json"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace('"defect": "relative-addressing"', '"defect": "undecidable-action"')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "manifest check goes red when a closed-vocabulary arm loses its only witness"
            Script  = "check-manifest.mjs"
            Expect  = "covering the Print arm"
            Perturb = {
                param($dir)
                # The way an arm's coverage really lapses: not by deleting a
                # vector — every other manifest check catches that — but by a
                # vector that quietly stops EXHIBITING the arm it was minted
                # for. `Print` is the sharpest case in the corpus, because its
                # whole document is its discriminator: one edit removes the
                # only witness the corpus has for arm seven, while the file
                # stays present, stays enumerated and (with its digest moved to
                # match, exactly as a careless regeneration would leave it)
                # stays digest-correct. Every other invariant goes on passing.
                #
                # Proved rather than assumed because the coverage pin is what
                # makes "closed at eight arms" a claim this corpus can be
                # measured against, and format version 2 is the change that
                # made it non-trivial.
                $target = Join-Path $dir "client-effect/print.json"
                $manifestPath = Join-Path $dir "manifest.json"
                $was = (Get-FileHash $target -Algorithm SHA256).Hash.ToLower()
                [IO.File]::WriteAllText($target, '{"kind":"Focus","nodeId":"orders-search"}')
                $now = (Get-FileHash $target -Algorithm SHA256).Hash.ToLower()
                $text = [IO.File]::ReadAllText($manifestPath)
                [IO.File]::WriteAllText($manifestPath, $text.Replace($was, $now))
            }
        },
        @{
            Name    = "manifest check goes red when a vector's reasons contradict its classification"
            Script  = "check-manifest.mjs"
            Expect  = "its reasons carry the verdict"
            Perturb = {
                param($dir)
                # The join no emitter can make for a reader: an emitter derives
                # both from one model and so cannot catch the manifest asserting
                # two things that do not describe one handler.
                $target = Join-Path $dir "manifest.json"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace(
                    "`"replaySafety`": `"unsafe`",`n      `"replayReasons`": [`n        {`n          `"stage`": 0,`n          `"defect`": `"outbound-notification`"",
                    "`"replaySafety`": `"safe`",`n      `"replayReasons`": [`n        {`n          `"stage`": 0,`n          `"defect`": `"outbound-notification`"")
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "manifest check goes red on a vector missing from the tree"
            Script  = "check-manifest.mjs"
            Expect  = "cross-layer/logic-tree-ref.json"
            Perturb = { param($dir) Remove-Item (Join-Path $dir "cross-layer/logic-tree-ref.json") -Force }
        },
        @{
            Name    = "manifest check goes red on a scenario file missing from the tree"
            Script  = "check-manifest.mjs"
            Expect  = "is enumerated but not present"
            Perturb = { param($dir) Remove-Item (Join-Path $dir "driver-semantics/chain-folds/tree.json") -Force }
        },
        @{
            Name    = "scenario check goes red on a step trace that lost a step"
            Script  = "check-scenarios.mjs"
            Expect  = "a trace carries one entry per step"
            Perturb = {
                param($dir)
                # Drop the LAST recorded step by cutting the trace at its final
                # entry, leaving every remaining byte untouched. Re-serialising
                # the file would perturb far more than the step count and let the
                # expectation below be satisfied by an unrelated finding.
                $target = Join-Path $dir "driver-semantics/chain-folds/expectation.json"
                $text = [IO.File]::ReadAllText($target)
                $cut = $text.LastIndexOf(",`n  {")
                [IO.File]::WriteAllText($target, $text.Substring(0, $cut) + "`n]")
            }
        },
        @{
            Name    = "scenario check goes red when a denial records the URL rather than the origin"
            Script  = "check-scenarios.mjs"
            # The one perturbation in this file that is a SECURITY defect rather
            # than a shape defect, and the only one whose damage survives the
            # session: a denial record outlives what produced it, so the query
            # string of a refused exfiltration attempt sitting in the audit trail
            # IS the disclosure the refusal prevented. Nothing else here can see
            # it — the trace is well-formed, the arm is right, the digest is the
            # only thing that moved.
            Expect  = "never the URL"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "driver-semantics/refused-destination/expectation.json"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace(
                    '"origin":"exfil.example"',
                    '"origin":"exfil.example/collect?session=secret"')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "scenario check goes red when an origin is recorded against an arm that consulted no destination"
            Script  = "check-scenarios.mjs"
            # `origin` says WHICH USE a refusal refused, and an Unregistered
            # denial refused no use — the capability was never reachable, so no
            # destination was ever consulted. The pairing is the kind of rule a
            # schema cannot state and a reader would therefore never be held to.
            Expect  = "carries an origin on Unregistered"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "driver-semantics/refused-destination/expectation.json"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace('"$type":"GateRefused","capability":"Navigate"', '"$type":"Unregistered","capability":"Navigate"')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "scenario check goes red when the corpus stops recording any denial"
            Script  = "check-scenarios.mjs"
            # The member's coverage pin, proved rather than assumed — the same
            # argument the as-emitted envelope's own `effectsSeen` check makes.
            # A `denials` no scenario records is a specified member no host has
            # ever had to produce or read, which is exactly the silence §5.5
            # refuses, applied to the corpus instead of to a host. The
            # perturbation is deliberately the SHAPE a regression takes: not a
            # deleted file, but a host that stopped recording what it declined
            # while every other member stayed correct.
            Expect  = "no scenario records a denial"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "driver-semantics/refused-destination/expectation.json"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace(
                    '"denials": [{"$type":"GateRefused","capability":"Navigate","origin":"exfil.example"}]',
                    '"denials": []')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "scenario check goes red on a host policy no host could construct"
            Script  = "check-scenarios.mjs"
            # A policy NAME is the whole mechanism by which a denial is
            # reproducible — the corpus never carries a policy as data. An
            # unrecognised name has to fail here rather than at whichever host
            # reads it next, because a host falling back to its own default would
            # report a scenario nobody evaluated as one that passed.
            Expect  = "is not a name"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "manifest.json"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace('"hostPolicy": "local-egress-only"', '"hostPolicy": "anything-goes"')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "scenario check goes red on an effect re-spelled in another member order"
            Script  = "check-scenarios.mjs"
            Expect  = "declaration order"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "driver-semantics/closure-free-effects/expectation.json"
                $text = [IO.File]::ReadAllText($target)
                # The effect is recorded as a STRING whose contents are the
                # document's own bytes, so the swap is a swap in those bytes —
                # which is exactly the granularity at which the envelope
                # exception lives, and exactly what an encoder that "tidied" the
                # family would change.
                $text = $text.Replace(
                    '{\"kind\":\"Navigate\",\"route\":\"/next\"}',
                    '{\"route\":\"/next\",\"kind\":\"Navigate\"}')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "scenario check goes red on a toy effect re-spelled in another member order"
            Script  = "check-scenarios.mjs"
            Expect  = "the toy emitter writes"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "driver-semantics-toy/sequence-folds/expectation.json"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace(
                    '{\"kind\":\"Sound\",\"nodeId\":\"set\",\"volume\":3}',
                    '{\"nodeId\":\"set\",\"kind\":\"Sound\",\"volume\":3}')
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "scenario check goes red on a toy starting tree that is not in canonical form"
            Script  = "check-scenarios.mjs"
            Expect  = "is not in canonical form"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "driver-semantics-toy/sequence-folds/tree.json"
                $text = [IO.File]::ReadAllText($target)
                [IO.File]::WriteAllText($target, $text.Replace('"id":"root"', '"id": "root"'))
            }
        },
        @{
            Name    = "scenario check goes red on a toy step tree carrying an undeclared member"
            Script  = "check-scenarios.mjs"
            Expect  = "carries undeclared"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "driver-semantics-toy/sequence-folds/expectation.json"
                $text = [IO.File]::ReadAllText($target)
                [IO.File]::WriteAllText($target, $text.Replace('"$type":"Read","key":"msg"', '"$type":"Read","key":"msg","via":"x"'))
            }
        },
        @{
            Name    = "emitter goes red on an altered toy fixture"
            Script  = "emit.mjs"
            Expect  = "FAIL toy-handler/minimal.json"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "toy-handler/minimal.json"
                $bytes = [IO.File]::ReadAllBytes($target)
                $bytes[$bytes.Length - 2] = $bytes[$bytes.Length - 2] -bxor 0x01
                [IO.File]::WriteAllBytes($target, $bytes)
            }
        },
        @{
            Name    = "independent emitter goes red on an altered toy fixture"
            Script  = "emit-independent.mjs"
            Expect  = "FAIL toy-handler/minimal.json"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "toy-handler/minimal.json"
                $bytes = [IO.File]::ReadAllBytes($target)
                $bytes[$bytes.Length - 2] = $bytes[$bytes.Length - 2] -bxor 0x01
                [IO.File]::WriteAllBytes($target, $bytes)
            }
        },
        @{
            Name    = "ordinal emitter goes red on an altered toy fixture"
            Script  = "emit-ordinal.py"
            Interp  = "python"
            Expect  = "FAIL toy-handler/minimal.json"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "toy-handler/minimal.json"
                $bytes = [IO.File]::ReadAllBytes($target)
                $bytes[$bytes.Length - 2] = $bytes[$bytes.Length - 2] -bxor 0x01
                [IO.File]::WriteAllBytes($target, $bytes)
            }
        },
        @{
            Name    = "emitter goes red when its toy walk stops reading the toy's call as inert"
            Script  = "emit.mjs"
            # The toy's `Ring` is the algebra's call, inert inside a stage
            # (§4.2). A walk that did not know the toy's cases — the referenced
            # subject's walk applied to toy tags — would read it as undecided,
            # and this vector is where that shows: its verdict moves.
            Expect  = "FAIL toy-handler/nested-call.json replaySafety"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "emit.mjs"
                $text = [IO.File]::ReadAllText($target)
                [IO.File]::WriteAllText($target, $text.Replace('case "Ring":', 'case "Ring-unread":'))
            }
        },
        @{
            Name    = "ordinal emitter goes red when its toy walk stops reading the toy's call as inert"
            Script  = "emit-ordinal.py"
            Interp  = "python"
            Expect  = "FAIL toy-handler/nested-call.json replaySafety"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "emit-ordinal.py"
                $text = [IO.File]::ReadAllText($target)
                [IO.File]::WriteAllText($target, $text.Replace('if kind == "Ring":', 'if kind == "Ring-unread":'))
            }
        },
        @{
            Name    = "independent emitter goes red when its toy walk reads a literal repeat as undecided"
            Script  = "emit-independent.mjs"
            # §10.7's row for a repeat is why the toy has a table of its own: a
            # literal bound re-runs the body and nothing else. Reading every
            # repeat as undecided is the natural shortcut, and this is the vector
            # that refuses it.
            Expect  = "FAIL toy-handler/repeat-literal.json replaySafety"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "emit-independent.mjs"
                $text = [IO.File]::ReadAllText($target)
                [IO.File]::WriteAllText($target, $text.Replace('Number.isInteger(action.bound) ?', 'false ?'))
            }
        },
        @{
            Name    = "emitter comparison goes red when one emitter re-orders the toy effect's members"
            Script  = "compare-emitters.mjs"
            Expect  = "FAIL toy-client-effect/sound"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "emit-independent.mjs"
                $text = [IO.File]::ReadAllText($target)
                $text = $text.Replace(
                    "[`"nodeId`", `"bell`"],`n    [`"volume`", 3],",
                    "[`"volume`", 3],`n    [`"nodeId`", `"bell`"],")
                [IO.File]::WriteAllText($target, $text)
            }
        },
        @{
            Name    = "manifest check goes red on a toy defect arm with no discriminating vector"
            Script  = "check-manifest.mjs"
            Expect  = "no toy-handler round-trip vector discriminates the non-literal-write arm"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "manifest.json"
                $text = [IO.File]::ReadAllText($target)
                [IO.File]::WriteAllText($target, $text.Replace('"defect": "non-literal-write"', '"defect": "undecidable-action"'))
            }
        },
        @{
            Name    = "manifest check goes red when the toy's client effect loses its only witness"
            Script  = "check-manifest.mjs"
            Expect  = "covering the Sound arm"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "toy-client-effect/sound.json"
                $manifestPath = Join-Path $dir "manifest.json"
                $was = (Get-FileHash $target -Algorithm SHA256).Hash.ToLower()
                [IO.File]::WriteAllText($target, '{"kind":"Hush","nodeId":"bell","volume":3}')
                $now = (Get-FileHash $target -Algorithm SHA256).Hash.ToLower()
                $text = [IO.File]::ReadAllText($manifestPath)
                [IO.File]::WriteAllText($manifestPath, $text.Replace($was, $now))
            }
        },
        @{
            Name    = "manifest check goes red when the toy vectors lose their subject"
            Script  = "check-manifest.mjs"
            # A toy vector with no subject is one the REFERENCED subject's host
            # runs — handing it a document in a vocabulary it does not read.
            Expect  = "declares no subject"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "manifest.json"
                $text = [IO.File]::ReadAllText($target)
                [IO.File]::WriteAllText($target, $text.Replace('"subject": "toy",', ''))
            }
        },
        @{
            Name    = "manifest check goes red when a toy vector carries a token no toy document can exhibit"
            Script  = "check-manifest.mjs"
            Expect  = "which no toy document can exhibit"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "manifest.json"
                $text = [IO.File]::ReadAllText($target)
                [IO.File]::WriteAllText($target, $text.Replace('"defect": "non-literal-write"', '"defect": "relative-addressing"'))
            }
        },
        @{
            Name    = "manifest check goes red when a document with toy copies is declared vocabulary-free"
            Script  = "check-manifest.mjs"
            Expect  = "duplicates it"
            Perturb = {
                param($dir)
                $target = Join-Path $dir "manifest.json"
                $text = [IO.File]::ReadAllText($target)
                [IO.File]::WriteAllText($target, $text.Replace(
                    "`"vocabularyFreeDocuments`": [`n    `"invocation`",",
                    "`"vocabularyFreeDocuments`": [`n    `"handler`",`n    `"invocation`","))
            }
        }
    )

    foreach ($t in $selfTests) {
        Write-Host ""
        Write-Host "== self-test: $($t.Name)" -ForegroundColor Cyan
        $scratch = Join-Path ([IO.Path]::GetTempPath()) ("programspec-selftest-" + [Guid]::NewGuid().ToString("N"))
        try {
            Copy-Item $fixtures $scratch -Recurse
            & $t.Perturb $scratch
            # A self-test names the interpreter its script needs; absent, node.
            $out = if ($t.Interp -eq "python") {
                Invoke-Python (Join-Path $scratch $t.Script) 2>&1
            }
            else {
                Invoke-Node (Join-Path $scratch $t.Script) 2>&1
            }
            $code = $LASTEXITCODE
            $said = ($out | Out-String)
            if ($code -eq 0) {
                $script:failed += "self-test: $($t.Name)"
                Write-Host "   the perturbed corpus PASSED — this checker cannot fail, so its green means nothing" -ForegroundColor Red
                $out | ForEach-Object { Write-Host "   | $_" }
            }
            elseif ($t.Expect -and -not $said.Contains($t.Expect)) {
                $script:failed += "self-test: $($t.Name)"
                Write-Host "   went red, but not for the perturbation — expected to see '$($t.Expect)'" -ForegroundColor Red
                $out | ForEach-Object { Write-Host "   | $_" }
            }
            else {
                Write-Host "   went red as required (exit $code)" -ForegroundColor Green
            }
        }
        finally {
            if (Test-Path $scratch) { Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }
}

Write-Host ""
if ($failed.Count -gt 0) {
    Write-Host "FAILED: $($failed -join '; ')" -ForegroundColor Red
    exit 1
}
Write-Host "All checks passed." -ForegroundColor Green
exit 0
