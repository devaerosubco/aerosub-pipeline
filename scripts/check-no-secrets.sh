#!/usr/bin/env bash
# Fails if real secret *material* is about to be committed / is in the build output:
#   - any eyJ... JWT whose base64 payload decodes to include "role":"service_role"
#   - a PEM private-key block
#   - a service-role key assignment (SERVICE_ROLE_KEY=..., service_role_key: ...) in code/config
# The anon key (also a JWT, payload "role":"anon") is deliberately shipped and is NOT flagged.
# Prose in *.md that merely mentions "service_role" is fine.
set -u
cd "$(dirname "$0")/.."

files=$( { git ls-files; [ -d dist ] && find dist -type f; } | sort -u )
fail=0

emit() { echo "FAIL ($1):"; echo "$2"; fail=1; }

# 1. service_role JWTs — anywhere, any file type
jwt_hits=$(printf '%s\n' "$files" | while read -r f; do
  [ -f "$f" ] || continue
  case "$f" in *.png|*.pdf|*.ico|package-lock.json) continue;; esac
  grep -oE 'eyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}' "$f" 2>/dev/null | while read -r tok; do
    p=$(printf '%s' "$tok" | cut -d. -f2)
    pad=$(( (4 - ${#p} % 4) % 4 )); p="$p$(printf '=%.0s' $(seq 1 $pad 2>/dev/null))"
    dec=$(printf '%s' "$p" | tr '_-' '/+' | base64 -d 2>/dev/null | tr -d ' ')
    case "$dec" in *'"role":"service_role"'*) echo "  $f (service_role JWT)";; esac
  done
done)
[ -n "$jwt_hits" ] && emit "service_role JWT" "$jwt_hits"

# 2. PEM private keys — anywhere
pem_hits=$(printf '%s\n' "$files" | while read -r f; do
  [ -f "$f" ] || continue
  grep -lE 'BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY' "$f" 2>/dev/null | sed 's/^/  /'
done)
[ -n "$pem_hits" ] && emit "PEM private key" "$pem_hits"

# 3. a service-role key *assignment with a real value* in code/config (not prose,
#    not this script). Placeholders / ${{ secrets.* }} references are fine.
asg_hits=$(printf '%s\n' "$files" | while read -r f; do
  [ -f "$f" ] || continue
  case "$f" in *.md|*.txt|scripts/check-no-secrets.sh) continue;; esac
  grep -InE '(service_role_key|SERVICE_ROLE_KEY)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?(eyJ|sb_secret_)' "$f" 2>/dev/null | sed "s|^|  $f:|"
done)
[ -n "$asg_hits" ] && emit "service-role key assignment" "$asg_hits"

[ "$fail" -eq 0 ] && echo "check-no-secrets: clean"
exit $fail
