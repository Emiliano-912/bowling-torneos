# Bowling Manager PWA — CLAUDE.md

## Qué es este proyecto
PWA de gestión de torneos de bowling para "Libertad 2026". App de un único archivo HTML (~6000+ líneas) con backend Node.js/Express para persistencia. Todas las respuestas, comentarios y código deben ser en **español**.

## Stack técnico
- **Frontend:** HTML5 + CSS3 + Vanilla JS (sin React, sin Vue, sin jQuery, sin frameworks)
- **Fuentes:** Bebas Neue + Nunito (Google Fonts)
- **Tema:** Dark theme con variables CSS (`--bg` #060a14, `--surface` #0b1224, `--card` #101830, `--border` #1a2540, `--border2` #253050, `--text` #eef0f8, `--muted` #506080, `--accent` #3b82f6, `--accent2` #ef4444)
- **Todo en un único `.html`** — CSS en `<style>`, JS en `<script>`
- **localStorage key:** `bowling_mgr_v2` (caché local)
- **Capturas:** html2canvas para screenshots PNG por tab
- **Backend:** Node.js/Express, persistencia en JSON file
- **Deploy:** Render free tier + UptimeRobot (ping cada 5 min)
- **Dominio:** bowlinglibertad2026.com (Namecheap, A record + CNAME www)

## Arquitectura cliente-servidor

### Autenticación
- Admin se autentica con contraseña via `POST /api/login`
- Contraseña almacenada en `sessionStorage` como `bowling_admin_pw`
- Variable `_serverPassword` mantiene la sesión en JS
- Cambio de contraseña via `POST /api/change-password`

### Sincronización de datos
- `loadFromServer()` → `GET /api/data` al iniciar
- `save()` → `saveLocal()` + `POST /api/data` con password en body
- Si el servidor rechaza por contraseña incorrecta, cierra sesión admin automáticamente
- Fallback offline: datos se guardan en localStorage

### Endpoints del servidor
```
GET  /api/data                → { ok, data }
POST /api/data                → { password, data } → guarda DB
POST /api/login               → { password } → { ok }
POST /api/change-password     → { currentPassword, newPassword }
```

---

## Modos de torneo

| Modo (`t.mode`) | Descripción |
|---|---|
| `individual` | Clasificación por fases, suma de palos |
| `equipo` | Parejas — múltiples formatos |
| `trio` | Tríos — misma lógica que parejas |
| `sexteto` | 6 jugadores, suma de líneas individuales |
| `mixto` | Múltiples modalidades combinadas |

### Torneos individuales — 4 subtipos (`t.indTipo`):
- **`recaudacion`**: Fases independientes, matches agrupados M1/M2, highlights de mejor línea y mejor match por fase con desempates manuales ⚡
- **`arrastre`**: Palos acumulados entre fases, total acumulado grande en verde, avance manual con selector de cantidad
- **`dia`**: Torneo de un día, una sola ronda sin final, hasta 60 jugadores
- **`liga_grupos`**: 24 jugadores en 6 grupos de 4, 23 fechas predefinidas, puntos bonus por categoría

### Formatos parejas/tríos (`t.format`):
- `zona` → Estilo Aniversario (round-robin por zonas)
- `suma+bracket` → Pica-Pica (suma de palos + bracket eliminación)
- `suma+zona` → Pica-Pica + Final (suma + bracket + zona final RR)
- `zona_dia` → Zona de un día (una zona, sin avance)
- `eliminacion` → Bracket directo
- `zona+elim` → Zonas + bracket

### Sexteto: `suma_palos` — cada jugador carga líneas, gana equipo con más suma total

### Mixto: Modalidades seleccionables (`seis`, `trios`, `parejas`, `individual`), puntos por puesto configurable, tabla de posiciones acumulada

---

## Estructura de datos principal

```javascript
// Torneo
{
  id, name, mode, format, cat, date,
  status,              // 'pendiente' | 'activo' | 'finalizado'
  countsForAvg: bool,  // si suma al promedio general
  
  // Individual
  participants: [pid],
  phases: [{ id, name, scores: {pid: [lineas]|number}, clasificados, locked, pool: [pid], manualBests: {}, tiebreakers: {} }],
  activePhase: number,
  lineasPorJugador: number,
  indTipo: 'recaudacion' | 'arrastre' | 'dia' | 'liga_grupos',
  
  // Liga por grupos
  ligaGrupos: { grupos, fechas, bonusConfig, ptsWin, ptsDraw, ptsLoss },
  
  // Parejas/Tríos
  teams: [{ id, name, members: [pid] }],
  zones: [{ id, name, entries: [{id, pts, pj, pg, pp, pinesF, pinesC}], matches: {} }],
  bracketRounds: [{ id, name, matches: [{id, a, b, scoreA, scoreB, winner, member_scores_a, member_scores_b}], locked }],
  ptsIndividual, ptsEquipo, clasificadosPorZona, mejoresTerceros, teamSize, zoneCount,
  
  // Suma+bracket
  sumaPalosScores: { teamId: [lineas] },
  sumaPalosMember: { teamId: { pid: [lineas] } },
  sumaLineasPorJugador: number,
  clasificadosMataMata: number,
  
  // Suma+zona
  clasificadosZonaFinal: number,
  zonaFinal: { entries, matches } | null,
  zonaFinalPtsInd, zonaFinalPtsEq,
  bracketWinBy: 'palos' | 'puntos',
  bracketPtsInd, bracketPtsEq,
  
  // Sexteto
  sextScores: { teamId: { pid: [lineas] } },
  
  // Mixto
  equipos: [{ id, name, members: [pid] }],
  modalidades: [{ id, key, name, tipo, equipos: [{subgrupoId, equipoId, members}], partidos, clasificacion, campeón, puntaje }],
  
  // Handicap & tiebreakers
  handicaps: { pid: number },
  catSnapshots: { pid: 'cat' },
  zoneTiebreakers: { 'idA_idB': winnerId },
}

// Jugador
{ id, name, cat, scores: [number] }

// DB global
{ players: [...], tournaments: [...], siteName: 'LIBERTAD', siteYear: '2026' }
```

---

## Sistema de Handicap

- **HCP NO se suma a los palos** — ya viene incluido en la línea cargada
- `getHcap(t, pid)` → HCP de un jugador en un torneo
- `getEntryHcap(t, id)` → para equipos, suma HCP de integrantes
- HCP se muestra como badges en todas las vistas
- Asignación en bulk por categoría (`openHcapByCategory`) o individual (`openHcapByPlayer`)
- `realAllScoresOf(p)` → promedios reales (resta HCP de cada línea de torneo)

## Sistema de Desempate

Orden estándar (`tiebreakCompare`):
1. Puntos/palos desc → 2. Palos a favor desc → 3. HCP asc (menor mejor) → 4. Spread asc (menor mejor) → 5. Manual ⚡

### Desempates manuales ⚡
- `pickBestMatch`, `pickBestLine` → mejor match/línea en recaudación
- `pickRankingTie` → ranking en fases
- `pickZoneTie` → posiciones en zonas
- Almacenados en `ph.manualBests`, `ph.tiebreakers`, `t.zoneTiebreakers`

## Snapshots de Categoría

`changePlayerCategory(pid, newCat)`:
1. Guarda categoría vieja en `t.catSnapshots[pid]` de todos los torneos donde participa
2. `getPlayerCatInTournament(t, pid)` retorna snapshot si existe

---

## Funciones clave (NO romper)

### Core
- `save()`, `loadFromServer()`, `invalidateScoreCache()`, `renderView()`, `renderTournamentDetail()`

### Scores
- `allScoresOf(p)` — con caché
- `realAllScoresOf(p)` — sin HCP
- `tournamentPlayerLines(t, pid)` — líneas de un jugador en un torneo
- `fmtAvg(n)` — `123,45`
- `phaseScoreLines(ph, pid)`, `phaseTotal(ph, pid)`, `getRankedPool(t, ph, pool)`

### Admin
- `isAdmin()`, `isTournamentAdmin()` — false si torneo finalizado
- `serverLogin()`, `adminToggle()`

### Torneos
- `getHcap(t, pid)`, `getEntryHcap(t, id)`, `getPlayerCatInTournament(t, pid)`
- `assignEntryToZone(t, entryId, zoneId)`, `tiebreakCompare(a, b, t, tiebreakers)`
- `buildFasesTab`, `buildSingleFase`, `buildArrastreView`
- `buildTeamsTab`, `buildZonasTab`, `buildSumaPalosTab`, `buildBracketTab`, `buildZonaFinalTab`
- `buildSextPuntajesTab`, `buildResultadosTab`
- `captureSection(elementId, filename)`, `captureTab()`
- `openSelectAdvancingModal(t, items, preSelected, callback, title)` — modal genérico de selección

### UI
- `openModal(id)` / `closeModal(id)`, `toast(msg, type)`, `appConfirm(msg)`
- `openDetail(playerId, filterTrnId)` — detalle con filtro por torneo

---

## Convenciones de código

- Modales reutilizan `#modal-match-result` con `#mr-body` y `#mr-submit`
- Labels dinámicos: `t.mode==='trio'?'tríos':t.mode==='sexteto'?'sextetos':'parejas'`
- Botones admin envueltos en `isTournamentAdmin()`
- IDs con `genId()`, categorías con `CAT_CLS[cat]` y `catColor(cat)`
- No usar `<form>` HTML — onclick/oninput/onchange
- Mobile first — touch targets grandes
- Campos nuevos siempre con `?? defaultValue`
- Llamar `invalidateScoreCache()` después de modificar scores
- Variables globales: `activeTournamentId`, `activeTournamentTab`, `adminMode`, `_serverPassword`, `_scoreCache`

---

## Errores conocidos / Lecciones

- Atributos `class` duplicados rompen handlers de click
- `openAddTournament` debe llamar a `ntModeChange()` para paneles correctos
- `autoFillFase` debe respetar `lineasPorJugador`
- Modo arrastre no debe reemplazar la vista de fase
- Cambios de contraseña en Render se pierden sin Disk persistente

---

## Pendiente

- Elegir manualmente quién avanza de fase Y armar cruces (quién vs quién) en todos los formatos
