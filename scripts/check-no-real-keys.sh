#!/usr/bin/env bash
#
# Ninguna prueba puede usar una clave REAL de un proveedor de IA.
#
# El e2e corre con `MINIMAX_API_KEY=test-key` y un provider mockeado: no
# gasta cuota de nadie. Si alguien pegase una clave real en un test (o
# apuntara el CI al key de produccion), las pruebas se comarian la cuota
# diaria del proyecto **en cada push**, sin que nadie se entere.
#
# El guard falla si encuentra algo con la forma de una clave de verdad.
set -euo pipefail

PATRONES='AIza[0-9A-Za-z_-]{25,}|sk-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9-]{20,}|ghp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.'

OBJETIVOS=("${@:-src test}")
fallos=0

for objetivo in "${OBJETIVOS[@]}"; do
  [ -e "$objetivo" ] || continue
  while IFS= read -r linea; do
    echo "::error::Se ha encontrado algo con forma de clave real: ${linea}"
    fallos=1
  done < <(grep -rnE "$PATRONES" "$objetivo" --include="*.ts" --include="*.js" --include="*.mjs" 2>/dev/null || true)
done

if [ "$fallos" = "1" ]; then
  echo "::error::Las pruebas no deben usar claves reales de proveedor (gastarian la cuota del proyecto)."
  exit 1
fi

echo "OK: ninguna clave real en las pruebas."
