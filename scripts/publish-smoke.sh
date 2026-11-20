#!/usr/bin/env bash
set -euo pipefail

mode="${1:-verify}"
origin="${SMOKE_ORIGIN:-https://help.hypertask.ai}"
base_path="${SMOKE_BASE_PATH:-/ratstack}"
dist="${SMOKE_DIST:-apps/web/dist/client}"
state="${SMOKE_STATE:-${RUNNER_TEMP:-/tmp}/ratstack-old-site.tsv}"
attempts=10
pause=6

fail() {
  printf 'Smoke check failed: %s\n' "$1" >&2
  exit 1
}

cleanup() {
  rm -f "${PROBE_BODY:-}" "${PROBE_HEADERS:-}"
}
trap cleanup EXIT

probe() {
  local url="$1"
  local follow="${2:-follow}"

  cleanup
  PROBE_BODY="$(mktemp)"
  PROBE_HEADERS="$(mktemp)"

  local curl_args=(
    --silent --show-error --max-time 30
    --retry 5 --retry-delay 5 --retry-all-errors
    --dump-header "$PROBE_HEADERS"
    --output "$PROBE_BODY"
    --write-out '%{http_code}'
  )

  if [ "$follow" = "follow" ]; then
    curl_args+=(--location)
  fi

  if ! PROBE_STATUS="$(curl "${curl_args[@]}" "$url")"; then
    fail "GET $url did not answer"
  fi
  PROBE_TITLE="$(sed -n 's:.*<title>\([^<]*\)</title>.*:\1:p' "$PROBE_BODY" | head -n 1)"
}

has_noindex() {
  grep -qiE '^x-robots-tag:[[:space:]]*noindex' "$PROBE_HEADERS"
}

require_200() {
  local url="$1"
  local attempt=1

  while [ "$attempt" -le "$attempts" ]; do
    probe "$url"
    if [ "$PROBE_STATUS" = "200" ]; then
      has_noindex || fail "$url answered without the X-Robots-Tag: noindex header"
      printf 'ok %s -> 200 noindex\n' "$url"
      return 0
    fi
    sleep "$pause"
    attempt=$((attempt + 1))
  done

  fail "$url answered $PROBE_STATUS on the last of $attempts attempts"
}

record() {
  probe "${origin}/" no-follow
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
  [ -d "$dist" ] || fail "The build output is missing at $dist"

  local baseline_status baseline_title
  IFS=$'\t' read -r baseline_status baseline_title < "$state"

  probe "${origin}/" no-follow
  if [ "$PROBE_STATUS" != "$baseline_status" ] ||
    [ "$PROBE_TITLE" != "$baseline_title" ]; then
    fail "${origin}/ answered ${PROBE_STATUS} \"${PROBE_TITLE}\" after the deploy, but ${baseline_status} \"${baseline_title}\" before it"
  fi
  printf 'ok %s/ -> %s "%s" unchanged\n' "$origin" "$PROBE_STATUS" "$PROBE_TITLE"

  local expected_title
  expected_title="$(sed -n 's:.*<title>\([^<]*\)</title>.*:\1:p' "$dist/index.html" | head -n 1)"
  local root="${origin}${base_path}"

  require_200 "$root"
  if [ -n "$expected_title" ] && [ "$PROBE_TITLE" != "$expected_title" ]; then
    fail "$root is titled \"$PROBE_TITLE\" and the build titles it \"$expected_title\""
  fi

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
    require_200 "$url"
  done

  local widget="${origin}${base_path}/widget/widget.js"

  require_200 "$widget"
  if ! grep -qiE '^content-type:[[:space:]]*(application|text)/javascript' \
    "$PROBE_HEADERS"; then
    fail "$widget did not answer as JavaScript"
  fi
  printf 'ok %s -> JavaScript\n' "$widget"
}

case "$mode" in
  record) record ;;
  verify) verify ;;
  *) fail "unknown mode $mode, use record or verify" ;;
esac
