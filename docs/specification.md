# DSH Skill Manager specification

## Problem Statement

DSH users currently need to leave the Web interface and manage reusable skills
manually. They need a safe Settings experience that discovers Skills.sh
catalog entries, installs them where DSH can discover them, and maintains only
the local skills the plugin owns without risking unrelated files or
user-managed skills.

## Solution

Add an installable DSH plugin with an independent Skill Manager Settings
section. The section searches Skills.sh, presents trustworthy catalog
metadata, and delegates confirmed lifecycle operations to a Host service. The
Host validates every remote response and confines transactional installation,
update, and removal to the DSH Skills Root.

## User Stories

1. As a DSH user, I want to open a dedicated Skill Manager in Settings, so that skill management is part of my normal DSH workflow.
2. As a DSH user, I want to search Skills.sh by keyword, so that I can find capabilities relevant to my work.
3. As a DSH user, I want each result to show its name and description, so that I can understand its purpose.
4. As a DSH user, I want each result to show its source and install count, so that I can judge provenance and adoption.
5. As a DSH user, I want to open the canonical Skills.sh page, so that I can inspect the source before installing.
6. As a DSH user, I want visible loading feedback, so that I know a search or operation is still running.
7. As a DSH user, I want an explicit empty state, so that no matches are not confused with a failure.
8. As a DSH user, I want network and response failures to be retryable, so that transient outages do not block me permanently.
9. As a DSH user, I want to review and confirm an installation, so that remote content is never written by an accidental click.
10. As a DSH user, I want a successfully installed skill to be discoverable by DSH, so that I can use it immediately.
11. As a DSH user, I want duplicate installation to be detected, so that an existing copy is not silently overwritten.
12. As a DSH user, I want user-owned local skills protected, so that the plugin cannot claim or overwrite content it did not install.
13. As a DSH user, I want to list Managed Skills, so that I know which local skills the plugin owns.
14. As a DSH user, I want local modifications identified, so that an update or removal cannot silently discard my changes.
15. As a DSH user, I want to check a Managed Skill for updates, so that I can decide when to adopt upstream changes.
16. As a DSH user, I want to distinguish an available update from a failed check, so that network trouble is not presented as version information.
17. As a DSH user, I want a Source Unavailable state to preserve my local copy, so that upstream deletion cannot remove working local content.
18. As a DSH user, I want to confirm updates, so that current files are not replaced without consent.
19. As a DSH user, I want stronger warning before overwriting local modifications, so that destructive consequences are clear.
20. As a DSH user, I want a failed update to restore the previous version, so that my skill remains usable.
21. As a DSH user, I want to confirm removal, so that a Managed Skill is not deleted accidentally.
22. As a DSH user, I want locally modified removal to carry an explicit warning, so that I understand my edits will be deleted.
23. As a DSH user, I want failures to explain whether the original skill was preserved, so that I know the recovery state.
24. As a security-conscious user, I want unsafe snapshot paths rejected, so that a skill cannot modify files outside the Skills Root.
25. As a security-conscious user, I want staging and backup data inside the Skills Root, so that every write honors the same boundary.
26. As a maintainer, I want build, type-check, test, and packaging commands, so that every change has repeatable feedback.
27. As a maintainer, I want automated lifecycle and path-safety coverage, so that destructive regressions are caught before release.
28. As an evaluator, I want a public repository with Issues, pull requests, AI disclosures, and decisions, so that the development process is auditable.
29. As an evaluator, I want one tested GitHub installation command, so that I can install the submitted plugin without modifying DSH.
30. As an evaluator, I want a concise end-to-end demonstration, so that the required behavior and test results are easy to verify.

## Implementation Decisions

- The project is one TypeScript package that contributes both a Host Cordis plugin and a Web client extension.
- The browser contributes an independent localized Settings section and performs no direct filesystem access.
- The Host exposes a narrow operation boundary for search, preparation, confirmation-bound mutation, inventory, update checks, updates, and removal.
- Skills.sh is the only online catalog and snapshot source. Its responses are treated as untrusted input and validated at runtime.
- Catalog search results are normalized before reaching the client. Descriptions may be enriched from validated skill metadata with bounded concurrency and cancellation.
- The DSH user Skills Root is the installation target and the boundary for all writes, staging, backups, manifests, and deletions.
- A versioned plugin manifest records ownership and provenance. A local directory absent from the manifest is user-owned and cannot be overwritten or removed by the plugin.
- Skill names must satisfy DSH's kebab-case discovery contract.
- Snapshot paths are normalized and checked against traversal, absolute paths, platform-specific escapes, duplicates, symbolic-link escapes, and resource limits.
- Lifecycle mutations use staging, atomic replacement where the platform permits it, manifest-last commit ordering, and explicit rollback.
- The update model compares the installed remote hash, current local content hash, and latest remote hash to distinguish current, updateable, locally modified, unavailable, and failed states.
- Source Unavailable is produced only by an authoritative missing-source response; timeout and transport failures remain retryable errors.
- Every installation, overwrite, update, and removal requires an explicit client confirmation tied to a prepared operation.
- Errors use stable public codes and safe messages; transport details and absolute home paths are not exposed to the browser.
- The package records compatible DSH versions and provides a GitHub-based installation command pinned to a release tag.

## Testing Decisions

- Test externally observable behavior at the highest stable seam: a filesystem-backed lifecycle service with a fake Skills.sh transport, plus mounted Settings components with an injected service face.
- Use isolated temporary Skills Roots created by the test runner; tests must assert that no operation writes outside the supplied root.
- Cover valid search, empty results, cancellation, network failure, HTTP failure, invalid response data, and unavailable sources.
- Cover fresh installation, duplicate managed installation, collision with an unmanaged directory, invalid skill metadata, interrupted installation, and manifest failure.
- Cover no update, available update, local modification, unavailable source, successful update, each rollback boundary, and rollback failure reporting.
- Cover confirmed removal, cancelled removal, modified removal warning, unmanaged removal rejection, and manifest rollback.
- Exercise path traversal using POSIX and Windows forms, absolute paths, normalized duplicates, NUL input, resource limits, and symbolic-link escapes.
- Test UI loading, ready, empty, retryable failure, confirmation, busy, success, and failure states through accessible roles and labels.
- Keep CI deterministic by mocking online responses. Run real Skills.sh and DSH package installation as an explicit smoke test before release.

## Out of Scope

- Publishing or editing Skills.sh catalog entries.
- Managing arbitrary local skills that were not installed by this plugin.
- Project-scoped skill roots in the first release.
- Bulk install, bulk update, favorites, ratings, categories, and recommendation ranking.
- Executing skill scripts during installation.
- Providing a security endorsement of third-party skill content.
- Modifying DSH source code or its built-in Settings implementation.

## Further Notes

- DSH and Skills.sh are evolving public projects. The implementation must
  verify their current released contracts before pinning dependencies.
- A passing automated suite is necessary but not sufficient; release requires
  a clean GitHub installation and a real DSH discovery smoke test.

