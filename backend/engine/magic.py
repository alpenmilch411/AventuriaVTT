"""
DSA5 Magie-System (Spell Resolution)

Implementiert die Zauberprobe (3W20) und Effektberechnung für Zaubersprüche.
Zauber kosten AsP (Astralpunkte) und verwenden die 3W20-Probe gegen die
drei Probeneigenschaften des Zaubers.

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

from typing import Optional

from . import probes


def resolve_spell(
    spell_data: dict,
    caster_data: dict,
    target_data: Optional[dict] = None,
    rolls: Optional[list[int]] = None,
    difficulty: int = 0,
) -> dict:
    """Löst einen Zauberspruch auf (3W20-Probe gegen Zaubereigenschaften).

    Ablauf:
    1. AsP-Kosten prüfen
    2. 3W20-Probe gegen die drei Zaubereigenschaften
    3. Bei Erfolg: AsP abziehen, Effekt berechnen
    4. Bei Misserfolg: Halbe AsP-Kosten (aufgerundet) als Verlust

    Args:
        spell_data: Zauberdaten mit:
            name (str): Name des Zaubers
            probe (list[str]): 3 Eigenschaftskürzel [z.B. 'MU', 'KL', 'IN']
            fw (int): Fertigkeitswert des Zaubers
            asp_cost (int): AsP-Kosten (Basis)
            asp_cost_per_qs (int, optional): Zusätzliche AsP pro QS
            reichweite (str, optional): Reichweite
            wirkungsdauer (str, optional): Wirkungsdauer
            zieldauer (str, optional): Zauberdauer
            effect (dict, optional): Effektbeschreibung
        caster_data: Zauberer-Daten mit:
            eigenschaften (dict): {MU: int, KL: int, IN: int, ...}
            current_asp (int): Aktuelle Astralpunkte
            sonderfertigkeiten (list[str], optional): SF-Liste
        target_data: Zieldaten (optional) mit:
            sk (int, optional): Seelenkraft (für Widerstands-Erschwernis)
            zk (int, optional): Zähigkeit
        rolls: 3 Würfelergebnisse (je 1-20). Wenn None, wird keine Probe gewürfelt.
        difficulty: Erschwernis/Erleichterung der Probe.

    Returns:
        dict mit:
            success (bool): Zauber gelungen
            qs (int): Qualitätsstufe (0 bei Misserfolg)
            asp_cost (int): Tatsächlich verbrauchte AsP
            asp_affordable (bool): Ob genug AsP vorhanden waren
            effect (dict|None): Berechneter Effekt bei Erfolg
            probe_result (dict|None): Ergebnis der 3W20-Probe
            spell_name (str): Name des Zaubers
    """
    spell_name = spell_data.get("name", "Unbekannter Zauber")
    base_asp_cost = spell_data.get("asp_cost", 0)
    probe_attributes = spell_data.get("probe", [])
    fw = spell_data.get("fw", 0)

    # AsP-Kosten prüfen
    current_asp = caster_data.get("current_asp", 0)
    if not check_asp_cost(current_asp, base_asp_cost):
        return {
            "success": False,
            "qs": 0,
            "asp_cost": 0,
            "asp_affordable": False,
            "effect": None,
            "probe_result": None,
            "spell_name": spell_name,
        }

    # Eigenschaftswerte für die Probe ermitteln
    eigenschaften = caster_data.get("eigenschaften", {})
    attributes = []
    for attr_key in probe_attributes:
        attr_value = eigenschaften.get(attr_key, 8)  # Fallback: 8
        attributes.append(attr_value)

    if len(attributes) != 3:
        raise ValueError(f"Zauber benötigt genau 3 Probeneigenschaften, "
                         f"hat aber {len(attributes)}: {probe_attributes}")

    # Widerstands-Erschwernis durch Ziel-SK/ZK
    target_resistance = 0
    if target_data:
        # Manche Zauber werden durch SK erschwert, andere durch ZK
        # Die Erschwernis ergibt sich aus der SK/ZK des Ziels minus der SK/ZK des Zauberers
        if spell_data.get("resistance_type") == "SK":
            target_sk = target_data.get("sk", 0)
            caster_sk = caster_data.get("sk", 0)
            target_resistance = -(target_sk - caster_sk) if target_sk > caster_sk else 0
        elif spell_data.get("resistance_type") == "ZK":
            target_zk = target_data.get("zk", 0)
            caster_zk = caster_data.get("zk", 0)
            target_resistance = -(target_zk - caster_zk) if target_zk > caster_zk else 0

    total_difficulty = difficulty + target_resistance

    # 3W20-Probe durchführen
    probe_result = None
    if rolls is not None:
        probe_result = probes.resolve_3w20_probe(
            attributes=attributes,
            fw=fw,
            rolls=rolls,
            difficulty=total_difficulty,
        )

        success = probe_result["success"]
        qs = probe_result["qs"]
    else:
        # Keine Würfel: nur Kosten-Check
        success = False
        qs = 0

    # AsP-Kosten berechnen
    if success:
        asp_cost = base_asp_cost
        asp_per_qs = spell_data.get("asp_cost_per_qs", 0)
        if asp_per_qs:
            asp_cost += asp_per_qs * qs
    else:
        # Bei Misserfolg: halbe Kosten (aufgerundet) gehen verloren
        asp_cost = -(-base_asp_cost // 2)  # Aufrunden

    # Effekt berechnen
    effect = None
    if success:
        effect = calculate_spell_effect(spell_data, qs)

    return {
        "success": success,
        "qs": qs,
        "asp_cost": asp_cost,
        "asp_affordable": True,
        "effect": effect,
        "probe_result": probe_result,
        "spell_name": spell_name,
    }


def check_asp_cost(current_asp: int, cost: int) -> bool:
    """Prüft ob der Zauberer genug Astralpunkte (AsP) hat.

    Args:
        current_asp: Aktuelle Astralpunkte.
        cost: Benötigte AsP.

    Returns:
        True wenn genug AsP vorhanden sind.
    """
    return current_asp >= cost


def calculate_spell_effect(spell_data: dict, qs: int) -> dict:
    """Berechnet den Effekt eines Zaubers basierend auf der QS.

    Die Effekte werden aus spell_data.effect ermittelt. Unterstützte Effekttypen:
    - damage: Schadenszauber (Schaden basierend auf QS)
    - condition: Zustandszauber (Zustand mit Stufe basierend auf QS)
    - buff: Verstärkungszauber (Bonus basierend auf QS)
    - heal: Heilzauber (Heilung basierend auf QS)

    Args:
        spell_data: Zauberdaten mit effect-Dict.
        qs: Qualitätsstufe (1-6).

    Returns:
        dict mit:
            damage (int|None): Schaden
            condition (dict|None): Zustand {name, stufe}
            buff (dict|None): Verstärkung {type, value}
            heal (int|None): Heilung
            duration (str|None): Wirkungsdauer
            description (str): Effektbeschreibung
    """
    effect_data = spell_data.get("effect", {})

    result = {
        "damage": None,
        "condition": None,
        "buff": None,
        "heal": None,
        "duration": spell_data.get("wirkungsdauer"),
        "description": "",
    }

    effect_type = effect_data.get("type", "")

    if effect_type == "damage":
        base = effect_data.get("base_damage", 0)
        per_qs = effect_data.get("damage_per_qs", 0)
        result["damage"] = base + (per_qs * qs)
        result["description"] = f"{result['damage']} SP Schaden"

    elif effect_type == "condition":
        cond_name = effect_data.get("condition_name", "")
        stufe_per_qs = effect_data.get("stufe_per_qs", 1)
        max_stufe = effect_data.get("max_stufe", 4)
        stufe = min(qs * stufe_per_qs, max_stufe)
        result["condition"] = {"name": cond_name, "stufe": stufe}
        result["description"] = f"Zustand {cond_name} Stufe {stufe}"

    elif effect_type == "buff":
        buff_type = effect_data.get("buff_type", "")
        value_per_qs = effect_data.get("value_per_qs", 1)
        result["buff"] = {"type": buff_type, "value": value_per_qs * qs}
        result["description"] = f"+{value_per_qs * qs} auf {buff_type}"

    elif effect_type == "heal":
        base_heal = effect_data.get("base_heal", 0)
        heal_per_qs = effect_data.get("heal_per_qs", 0)
        result["heal"] = base_heal + (heal_per_qs * qs)
        result["description"] = f"{result['heal']} LeP geheilt"

    else:
        result["description"] = effect_data.get("description", f"QS {qs} Effekt")

    return result
