#!/usr/bin/env bash
set -euo pipefail

mode="${1:-verify}"
origin="${SMOKE_ORIGIN:-https://help.hypertask.ai}"
base_path="${SMOKE_BASE_PATH:-/ratstack}"
dist="${SMOKE_DIST:-apps/web/dist/client}"
state="${SMOKE_STATE:-${RUNNER_TEMP:-/tmp}/ratstack-old-site.tsv}"

fail() {
  printf 'Smoke check failed: %s\n' "$1" >&2
  exit 1
}

cleanup() {
  rm -f "${PROBE_BODY:-}" "${PROBE_HEADERS:-}"
}
trap cleanup EXIT

probe() {
  cleanup
  PROBE_BODY="$(mktemp)"
  PROBE_HEADERS="$(mktemp)"
  if ! PROBE_STATUS="$(curl --silent --show-error --location --max-time 30 \
    --retry 5 --retry-delay 5 --retry-all-errors \
    --dump-header "$PROBE_HEADERS" --output "$PROBE_BODY" \
    --write-out '%{http_code}' "$1")"; then
    fail "GET $1 did not answer"
  fi
  PROBE_TITLE="$(sed -n 's:.*<title>\([^<]*\)</title>.*:\1:p' "$PROBE_BODY" | head -n 1)"
}

has_noindex() {
  grep -qiE '^x-robots-tag:[[:space:]]*noindex' "$PROBE_HEADERS"
}

record() {
  probe "${origin}/"
  printf '%s\t%s\n' "$PROBE_STATUS" "$PROBE_TITLE" > "$state"
  printf 'Recorded the old site before the deploy: %s/ answered %s "%s"\n' \
    "$origin" "$PROBE_STATUS" "$PROBE_TITLE"
}

page_addresses() {
  local file relative

  while IFS= read -r file; do
    relative="${file#./}"
    if [ "$relative" = "index.html" ]; then
      continue
    fi
    if [ "${relative%/index.html}" != "$relative" ]; then
      printf '%s/%s\n' "$base_path" "${relative%/index.html}"
    else
      printf '%s/%s\n' "$base_path" "${relative%.html}"
    fi
  done < <(cd "$dist" && find . -type f -name '*.html' | sort)
}

asset_addresses() {
  local file

  while IFS= read -r file; do
    printf '%s/%s\n' "$base_path" "${file#./}"
  done < <(cd "$dist" && find ./assets -type f 2>/dev/null | sort)
}

verify() {
  [ -f "$state" ] || fail "The old-site record is missing at $state"

  local baseline_status baseline_title
  IFS=$'\t' read -r baseline_status baseline_title < "$state"

  probe "${origin}/"
  if [ "$PROBE_STATUS" != "$baseline_status" ] ||
    [ "$PROBE_TITLE" != "$baseline_title" ]; then
    fail "${origin}/ answered ${PROBE_STATUS} \"${PROBE_TITLE}\" after the deploy, but ${baseline_status} \"${baseline_title}\" before it"
  fi
  printf 'ok %s/ -> %s "%s" unchanged\n' "$origin" "$PROBE_STATUS" "$PROBE_TITLE"

  [ -d "$dist" ] || fail "The build output is missing at $dist"

  local expected_title
  expected_title="$(sed -n 's:.*<title>\([^<]*\)</title>.*:\1:p' "$dist/index.html" | head -n 1)"
  local root="${origin}${base_path}"

  probe "$root"
  [ "$PROBE_STATUS" = "200" ] || fail "$root answered $PROBE_STATUS"
  has_noindex || fail "$root answered without the X-Robots-Tag: noindex header"
  if [ -n "$expected_title" ] && [ "$PROBE_TITLE" != "$expected_title" ]; then
    fail "$root is titled \"$PROBE_TITLE\" and the build titles it \"$expected_title\""
  fi
  printf 'ok %s -> 200 "%s" noindex\n' "$root" "$PROBE_TITLE"

  local -a addresses=("${base_path}/")
  local address

  while IFS= read -r address; do
    [ "${#addresses[@]}" -ge 3 ] && break
    addresses+=("$address")
  done < <(page_addresses)

  while IFS= read -r address; do
    [ "${#addresses[@]}" -ge 3 ] && break
    addresses+=("$address")
  done < <(asset_addresses)

  [ "${#addresses[@]}" -ge 3 ] ||
    fail "the build at $dist lists ${#addresses[@]} addresses beyond the root, and three are required"
  local index url
  for index in 0 1 2; do
    url="${origin}${addresses[$index]}"
    probe "$url"
    [ "$PROBE_STATUS" = "200" ] || fail "$url answered $PROBE_STATUS"
    has_noindex || fail "$url answered without the X-Robots-Tag: noindex header"
    printf 'ok %s -> 200 noindex\n' "$url"
  done
}

case "$mode" in
  record) record ;;
  verify) verify ;;
  *) fail "unknown mode $mode, use record or verify" ;;
esac
