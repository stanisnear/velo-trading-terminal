#!/usr/bin/env bash
set -euo pipefail

# Reproduce only the isolated V4 candidate, without deployment credentials,
# bridge dependencies, live RPC calls or Pyth API usage.
repo_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
candidate_work="$(mktemp -d "${TMPDIR:-/tmp}/velo-v4.XXXXXX")"
trap 'rm -rf "$candidate_work"' EXIT
mkdir -p "$candidate_work/src/interfaces" "$candidate_work/test" "$candidate_work/lib/openzeppelin-contracts" "$candidate_work/lib/forge-std"
cp "$repo_root/contracts/src/VeloIsolatedV4Candidate.sol" "$candidate_work/src/"
cp "$repo_root/contracts/src/interfaces/IPythV2.sol" "$candidate_work/src/interfaces/"
cp "$repo_root/contracts/test/VeloIsolatedV4Candidate.t.sol" "$repo_root/contracts/test/VeloIsolatedV4Invariant.t.sol" "$candidate_work/test/"

install_pinned() {
  local destination="$1" remote="$2" revision="$3"
  git -C "$destination" init --quiet
  git -C "$destination" fetch --quiet --depth 1 "$remote" "$revision"
  git -C "$destination" checkout --quiet --detach FETCH_HEAD
  test "$(git -C "$destination" rev-parse HEAD)" = "$revision"
}
install_pinned "$candidate_work/lib/openzeppelin-contracts" https://github.com/OpenZeppelin/openzeppelin-contracts.git dbb6104ce834628e473d2173bbc9d47f81a9eec3
install_pinned "$candidate_work/lib/forge-std" https://github.com/foundry-rs/forge-std.git 77041d2ce690e692d6e03cc812b57d1ddaa4d505
cat > "$candidate_work/foundry.toml" <<'TOML'
[profile.default]
src = "src"
test = "test"
solc = "0.8.22"
optimizer = true
optimizer_runs = 200
via_ir = false
remappings = ["@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/", "forge-std/=lib/forge-std/src/"]
[profile.default.fuzz]
runs = 256
[profile.default.invariant]
runs = 128
depth = 64
fail_on_revert = true
TOML
"${VELO_FORGE_BIN:-forge}" test --root "$candidate_work"
