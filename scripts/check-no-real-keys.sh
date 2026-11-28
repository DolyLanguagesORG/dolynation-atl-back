#!/usr/bin/env bash
#
# Ninguna prueba ni archivo de configuración versionado puede exponer una clave REAL.
#
# El e2e corre con `MINIMAX_API_KEY=test-key` y un provider mockeado: no
# gasta cuota de nadie. Si alguien pegase una clave real en un test, workflow,
# script o `.env.example`, se expondría o gastaría cuota sin que nadie lo note.
#
# El guard falla si encuentra algo con la forma de una clave de verdad.
set -euo pipefail

PATRONES='AIza[0-9A-Za-z_-]{25,}|GOCSPX-[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9-]{20,}|sk_live_[0-9A-Za-z]{20,}|rk_live_[0-9A-Za-z]{20,}|sk_test_[0-9A-Za-z]{20,}|whsec_[0-9A-Za-z]{20,}|ghp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.'

if [ "$#" -gt 0 ]; then
  OBJETIVOS=("$@")
else
  OBJETIVOS=(src test .github scripts .env.example)
fi
fallos=0

for objetivo in "${OBJETIVOS[@]}"; do
  [ -e "$objetivo" ] || continue
  if [ -d "$objetivo" ]; then
    resultados="$(grep -rnE "$PATRONES" "$objetivo" \
      --include="*.ts" --include="*.js" --include="*.mjs" --include="*.cjs" \
      --include="*.yml" --include="*.yaml" --include="*.sh" \
      --include="*.json" --include="*.env*" --exclude="package-lock.json" 2>/dev/null || true)"
  else
    resultados="$(grep -nE "$PATRONES" "$objetivo" 2>/dev/null || true)"
  fi

  while IFS= read -r linea; do
    [ -n "$linea" ] || continue
    echo "::error::Se ha encontrado algo con forma de clave real en ${objetivo}: ${linea}"
    fallos=1
  done <<< "$resultados"
done

if [ "$fallos" = "1" ]; then
  echo "::error::No deben existir claves reales de proveedor ni de pasarela en archivos versionados."
  exit 1
fi

echo "OK: ninguna clave real detectada."
