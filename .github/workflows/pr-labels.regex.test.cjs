#!/usr/bin/env node
// Test del regex de palabras clave de cierre que usa pr-labels.yml.
//
// Por que existe: este regex copiaba las etiquetas de issues que GitHub no
// iba a cerrar nunca (mencionaba 'Closes #6' dentro de una frase y lo tomaba
// como cierre real). El sintoma era invisible: el PR salia con las etiquetas
// del issue equivocado y nadie sabia por que.
//
// Para que el test no se desincronice del workflow, NO repite el regex aqui:
// lo extrae del propio pr-labels.yml y lo evalua. Si alguien cambia el regex
// del workflow sin actualizar el comportamiento esperado, este test falla.
//
// Uso:  node .github/workflows/pr-labels.regex.test.cjs

const fs = require('fs');
const path = require('path');

const WORKFLOW = path.join(__dirname, 'pr-labels.yml');

// ---------------------------------------------------------------------------
// Extraer la expresion `new RegExp(...)` del workflow, sin depender de la
// sangria ni de cuantos fragmentos string se_parta en varias lineas.
// ---------------------------------------------------------------------------
function extractRegExpExpression(source) {
  const start = source.indexOf('new RegExp(');
  if (start === -1) {
    throw new Error('No se encontro "new RegExp(" en ' + WORKFLOW);
  }

  let depth = 0;
  let quote = null;
  let i = start;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('El "new RegExp(" de pr-labels.yml no esta balanceado');
}

const workflow = fs.readFileSync(WORKFLOW, 'utf8');
const expression = extractRegExpExpression(workflow);
const CLOSE_RE = new Function('return ' + expression + ';')();

function issuesClosedBy(body) {
  return [...new Set([...body.matchAll(CLOSE_RE)].map((m) => Number(m[1])))];
}

// ---------------------------------------------------------------------------
// Casos. El criterio no es "lo que parece intuitivo", es "lo que hace
// GitHub", que es lo que el workflow tiene que imitar para no mentir.
// ---------------------------------------------------------------------------
const CASOS = [
  // Deben detectar: la palabra al inicio de una linea.
  ['Closes #38', [38], 'linea propia'],
  ['   Closes #12', [12], 'sangria'],
  ['- Closes #7', [7], 'item de lista'],
  ['* Fixes #9', [9], 'lista con asterisco'],
  ['1. Resolves #4', [4], 'lista numerada'],
  ['> Closes #3', [3], 'cita'],
  ['**Closes #5**', [5], 'en negrita'],
  ['Closes #20\nCloses #21', [20, 21], 'dos lineas propias'],
  ['Closes DolyLanguagesORG/doly-languages#15', [15], 'referencia cruzada'],

  // NO deben detectar: aqui es donde fallaba.
  ['se mergeo con `Closes #6` en el cuerpo y el issue', [], 'mencion en prosa'],
  ['usa Closes #8 al final', [], 'mencion suelta en prosa'],
  ['Refs #6', [], 'Refs no es palabra de cierre'],
  ['Resuelve #2', [], 'en espanol no cuenta'],
  ['closes#9', [], 'sin espacio no cuenta'],
  ['', [], 'cuerpo vacio'],
  ['Resumen del trabajo', [], 'sin palabra de cierre'],
];

let fallos = 0;
for (const [cuerpo, esperado, nota] of CASOS) {
  const obtenido = issuesClosedBy(cuerpo);
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(
    '  ' +
      (ok ? 'OK   ' : 'FALLA') +
      ' ' +
      JSON.stringify(obtenido).padEnd(10) +
      ' esperado ' +
      JSON.stringify(esperado).padEnd(10) +
      '  ' +
      nota
  );
}

console.log('');
if (fallos > 0) {
  console.error('  ' + fallos + ' caso(s) fallan.');
  process.exit(1);
}
console.log('  ' + CASOS.length + ' casos pasan.');
