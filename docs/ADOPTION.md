# Adoption tracking

This project does not collect hidden product telemetry. Adoption is reviewed from
public repository and registry data, plus task reports that users choose to
share. Local browser interaction events only drive the dashboard visualization;
they are not an installation or usage counter.

## Public baseline — 24 September 2026

| Signal | Observed value | Source |
| --- | ---: | --- |
| GitHub stars | 5 | Public repository metadata |
| GitHub forks | 1 | Public repository metadata |
| Watchers | 0 | Public repository metadata |
| Listed contributors | 1 | Public contributors endpoint |
| Open issues / pull requests | 0 / 0 | Public GitHub API |
| Discussions | Disabled | Public repository metadata |
| GitHub releases / asset downloads | 0 / not applicable | Public releases endpoint |
| npm `free-computer-use@0.1.0` | Not published (registry returned 404) | npm registry query |
| Installations / community task reproductions | Installations not measured; no public reproductions documented | No installation telemetry; public issue list is empty and Discussions are disabled |

This is a dated baseline, not a growth claim. GitHub stars and forks are
secondary signals; they do not show that an installation or browser task
worked. No public issue or discussion currently records a user reproduction.

## Monthly review

Review these public signals on or after the 24th of each month, after a public
release exists:

1. Record stars, forks, listed contributors, open issues and pull requests.
2. Sum download counts for published GitHub Release assets. Record npm registry
   downloads only after the package is published.
3. Review public bug reports for installation, provider, security, documentation
   and workflow blockers. Link each confirmed problem to a roadmap acceptance
   criterion and an issue; close the loop with a reproduced fix or a documented
   limitation.
4. Record user-reported task reproductions only when the user chooses to share
   them. Ask before quoting or publishing private feedback.

Do not infer installation counts from stars, add background analytics, or use
owner-only GitHub traffic reports as public adoption data. Keep reviews manual;
the repository's current policy does not allow GitHub Actions validation.

## Collection commands

These read public metadata and do not change the repository:

```sh
gh api repos/OthmaneBlial/FreeComputerUse --jq '{stars: .stargazers_count, forks: .forks_count, watchers: .subscribers_count, discussions: .has_discussions}'
gh api 'repos/OthmaneBlial/FreeComputerUse/issues?state=open&per_page=100' --jq '[.[] | select(has("pull_request") | not)] | length'
gh api 'repos/OthmaneBlial/FreeComputerUse/pulls?state=open&per_page=100' --jq 'length'
gh api 'repos/OthmaneBlial/FreeComputerUse/contributors?per_page=100' --jq 'length'
gh api 'repos/OthmaneBlial/FreeComputerUse/releases?per_page=100' --jq '[.[] | .assets[].download_count] | add // 0'
npm view free-computer-use@0.1.0 version
```

An npm 404 means no public version was found; it is not a zero-download
measurement. Do not query or publish private analytics to fill gaps.

**Next review:** 24 October 2026, or after the first public release if later.
