# Issue tracker: GitHub

Issues and specs for this repository live in GitHub Issues. Use the `gh` CLI
from this clone so the `origin` remote selects `changxuanfan/noumena_gpt`.

## Conventions

- Create an issue with `gh issue create --title "..." --body-file <file>`.
- Read an issue and its discussion with `gh issue view <number> --comments`.
- List work with `gh issue list --state open --json number,title,body,labels,comments`.
- Comment with `gh issue comment <number> --body "..."`.
- Apply or remove labels with `gh issue edit`.
- Close completed work with `gh issue close`.
- Pull requests are not a triage request surface.

GitHub Issues and pull requests share one number sequence. Resolve an ambiguous
reference by trying `gh pr view <number>` before `gh issue view <number>`.

## Publishing and fetching

When a skill says to publish to the issue tracker, create a GitHub Issue. When
it asks for the relevant ticket, read the GitHub Issue including comments and
labels.

## Dependencies

Use GitHub native issue dependencies when available. If the repository cannot
create a native dependency, add `Blocked by: #<number>` to the dependent issue
and treat every referenced open issue as a live blocker.
