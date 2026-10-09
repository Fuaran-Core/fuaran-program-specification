# Security Policy

## Supported versions

The specification and its conformance corpus are pre-1.0. Fixes are applied to the latest revision
on the `main` branch; older snapshots are not maintained.

## Reporting a vulnerability

Please report suspected vulnerabilities privately — do **not** open a public issue.

- **Preferred:** GitHub's private vulnerability reporting (the repository's **Security** tab →
  **Report a vulnerability**).
- **Or email:** andrew@fuaran.com — include a description, the affected section or vector, and
  steps to reproduce.

We aim to acknowledge a report within five business days and to agree a disclosure timeline with
you. Please allow a reasonable window to ship a fix before any public disclosure.

## Scope

This repository is a **specification and a corpus of test vectors**. It executes nothing in
production and holds no credential, so the interesting failures here are failures of the *text*,
and they are in scope precisely because they propagate into every implementation that reads it:

- **A path by which an untrusted document widens a capability envelope.** The whole design rests on
  the envelope being fixed before any generated program arrives: the vocabularies are closed, the
  capability a gate is asked about is derived rather than carried, extension is a host act, and a
  program-declared result target is refused. A reading of the text under which a document reaches
  something its host did not register — or names where a privileged handler's answer is written — is
  a finding, even where every implementation happens to refuse it today.
- **A rule that lets a wire-carried string reach a log.** §4.4 is the sharpest edge in this document:
  once a handler has a wire form, every string in it is attacker-chosen, and the diagnostics are
  shaped around saying only what the host derives. A position where the text permits echoing a
  wire-carried value — the `Bounded` pass-through in §6.5 is the known one, and is recorded there —
  is in scope.
- **A rule that does not determine the bytes.** Two conformant readers disagreeing about the same
  document is a specification defect, not an implementation bug. §2's canonicalisation exists to
  make that impossible, and a case where it does not is a finding.
- **A refusal that a conformant reader can skip.** The `reject` vectors state what a reader must turn
  away, and Appendix A names the class each is refused for. A malformed document the normative text
  does not require refusing — or requires refusing only by implication — is in scope.
- **A vector whose digest does not match its file**, or a manifest enumeration that omits a vector
  present in the tree. Both make a conformance claim mean less than it appears to.

Out of scope: the behaviour of any particular implementation, which belongs with that
implementation's own security policy.
