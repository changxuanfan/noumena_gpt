# Use a Skills.sh HTTP boundary instead of invoking the Skills CLI

The plugin will access Skills.sh through a small validated HTTP adapter rather
than parsing `npx skills` subprocess output. This keeps online data restricted
to the required source, gives the Web UI stable typed errors, and lets the
plugin enforce that every filesystem mutation stays within the DSH Skills
Root; the adapter isolates the risk that Skills.sh's currently public API may
change.
