/**
 * DSA5 Combat Maneuvers — single source of truth.
 *
 * Basismanöver are available to everyone (with -2 penalty without the matching SF).
 * Spezialmanöver require the matching SF.
 *
 * Used by TurnFlow (GM side) and CombatOverlay (player side).
 */

export const MANEUVERS = [
  // Basis-Manöver — available to everyone
  { id: 'none', label: 'Ohne Manöver', atMod: 0, paMod: 0, tpMod: 0, desc: 'Normaler Angriff ohne Manöver.', type: 'basis' },
  { id: 'wuchtschlag1', label: 'Wuchtschlag I', atMod: -1, paMod: 0, tpMod: 1, desc: '-1 AT, +1 TP. Härter zuschlagen auf Kosten der Treffsicherheit.', type: 'basis' },
  { id: 'wuchtschlag2', label: 'Wuchtschlag II', atMod: -2, paMod: 0, tpMod: 2, desc: '-2 AT, +2 TP. Noch härter zuschlagen.', type: 'basis' },
  { id: 'finte1', label: 'Finte I', atMod: -1, paMod: 0, tpMod: 0, desc: '-1 AT, Gegner erhält -1 auf Parade.', defMod: -1, type: 'basis' },
  { id: 'finte2', label: 'Finte II', atMod: -2, paMod: 0, tpMod: 0, desc: '-2 AT, Gegner erhält -2 auf Parade.', defMod: -2, type: 'basis' },
  // SF-gated Spezialmanöver
  { id: 'hammerschlag', label: 'Hammerschlag', atMod: -4, paMod: 0, tpMod: 4, halveRS: true, desc: 'AT-4, +4 TP und RS des Gegners halbiert. Benötigt Hiebwaffen/Zweihandäxte/Zweihandschwerter.', requiredSF: 'Hammerschlag', techniques: ['Hiebwaffen', 'Zweihandäxte', 'Zweihandschwerter'], type: 'spezial' },
  { id: 'sturmangriff', label: 'Sturmangriff', atMod: 2, paMod: -2, tpMod: 0, desc: 'AT+2 bei 4+ Schritt Anlauf, PA-2 in dieser KR.', requiredSF: 'Sturmangriff', type: 'spezial' },
  { id: 'klingensturm', label: 'Klingensturm', atMod: -4, paMod: -99, tpMod: 0, desc: 'AT-4, 2 Angriffe gegen verschiedene Gegner. Keine PA in dieser KR.', requiredSF: 'Klingensturm', techniques: ['Schwerter', 'Fechtwaffen'], noPAThisRound: true, type: 'spezial' },
  { id: 'todesstoss', label: 'Todesstoß', atMod: -8, paMod: 0, tpMod: 0, desc: 'AT-8, Schaden verdoppelt (nach RS). Einmal pro Kampf.', requiredSF: 'Todesstoß', doubleDamage: true, techniques: ['Schwerter', 'Dolche', 'Fechtwaffen', 'Stangenwaffen'], type: 'spezial' },
  { id: 'windmuehle', label: 'Windmühle', atMod: -4, paMod: -99, tpMod: 0, desc: 'AT-4 gegen alle Gegner in Nahkampfreichweite (max 3). Keine PA.', requiredSF: 'Windmühle', techniques: ['Zweihandschwerter', 'Zweihandäxte', 'Stangenwaffen'], noPAThisRound: true, type: 'spezial' },
  { id: 'niederwerfen', label: 'Niederwerfen', atMod: -2, paMod: 0, tpMod: 0, desc: 'AT-2, bei Treffer KK-Vergleich — Gegner liegt am Boden.', requiredSF: 'Niederwerfen', techniques: ['Raufen'], type: 'spezial' },
  { id: 'gezielter_stich', label: 'Gezielter Stich', atMod: -4, paMod: 0, tpMod: 0, desc: 'AT-4, ignoriert 2 RS des Gegners.', requiredSF: 'Gezielter Stich', ignoreRS: 2, techniques: ['Dolche', 'Fechtwaffen'], type: 'spezial' },
  { id: 'entwaffnen', label: 'Entwaffnen', atMod: -4, paMod: 0, tpMod: 0, desc: 'AT-4, kein Schaden. KK-Vergleich: Gegner verliert Waffe.', requiredSF: 'Entwaffnen', noDamage: true, techniques: ['Schwerter', 'Fechtwaffen', 'Stangenwaffen'], type: 'spezial' },
]

/** Subset of basis maneuvers for simplified player-side combat overlay */
export const PLAYER_MANEUVERS = MANEUVERS.filter(m => m.type === 'basis')
