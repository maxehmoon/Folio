# Releasing Folio

Container builds from `main` are tested on AMD64 and ARM64 before the workflow updates `edge` and the immutable `sha-<commit>` tag. Releases promote that same tested image; they do not rebuild it.

## Stable release

1. Update `version` in `package.json` and merge that change into `main`.
2. Wait for the **Publish container** workflow to pass for that commit.
3. Create a GitHub release from the same commit with a tag such as `v1.0.0`.
4. Generate and review the release notes, then publish the release without marking it as a pre-release.

The **Release container** workflow promotes the tested commit image to `1.0.0` and `latest`. Exact version tags cannot be moved to a different image.

## Beta release

Follow the same process with a version and tag such as `0.2.0-beta.1` and `v0.2.0-beta.1`, then mark the GitHub release as a pre-release.

The workflow promotes the tested image to `0.2.0-beta.1` and `beta`. It does not update `latest`.
