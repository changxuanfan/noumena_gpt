# DSH Skill Management

This context covers discovering remote Skills.sh skills and managing the
plugin-owned copies that DeepSeek Harness can load from its user skill root.

## Language

**Catalog Skill**:
A skill advertised by Skills.sh, identified by its source repository and skill
slug.
_Avoid_: Marketplace app, package

**Managed Skill**:
A local skill whose lifecycle is owned by this plugin and recorded in its
manifest. A local skill not recorded there remains user-owned.
_Avoid_: Installed skill, when ownership is ambiguous

**Skill Snapshot**:
The validated set of files and content hash returned for one Catalog Skill at
a point in time.
_Avoid_: Package, archive

**Skills Root**:
The DSH user skill directory that is both the discovery location and the hard
boundary for every plugin write, backup, staging file, and deletion.
_Avoid_: Workspace, install directory

**Source Unavailable**:
The state where Skills.sh explicitly no longer provides a Managed Skill's
source. It does not imply that the local skill should be removed.
_Avoid_: Network error, missing skill
