"""
DSA5 Liturgie-System (Liturgy Resolution)

Implementiert die Liturgieprobe (3W20) und Effektberechnung für Liturgien/Zeremonien.
Liturgien kosten KaP (Karmapunkte) und verwenden die 3W20-Probe gegen die
drei Probeneigenschaften der Liturgie.

Funktioniert analog zum Magie-System, nutzt aber KaP statt AsP.

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

from typing import Optional

from . import probes


def resolve_liturgy(
    liturgy_data: dict,
    blessed_data: dict,
    target_data: Optional[dict] = None,
    rolls: Optional[list[int]] = None,
    difficulty: int = 0,
) -> dict:
    """Löst eine Liturgie/Zeremonie auf (3W20-Probe gegen Liturgie-Eigenschaften).

    Ablauf:
    1. KaP-Kosten prüfen
    2. 3W20-Probe gegen die drei Liturgie-Eigenschaften
    3. Bei Erfolg: KaP abziehen, Effekt berechnen
    4. Bei Misserfolg: Halbe KaP-Kosten (aufgerundet) als Verlust

    Args:
        liturgy_data: Liturgiedaten mit:
            name (str): Name der Liturgie
            probe (list[str]): 3 Eigenschaftskürzel [z.B. 'MU', 'IN', 'CH']
            fw (int): Fertigkeitswert der Liturgie
            kap_cost (int): KaP-Kosten (Basis)
            kap_cost_per_qs (int, optional): Zusätzliche KaP pro QS
            reichweite (str, optional): Reichweite
            wirkungsdauer (str, optional): Wirkungsdauer
            liturgiedauer (str, optional): Liturgiedauer
            effect (dict, optional): Effektbeschreibung
        blessed_data: Geweihten-Daten mit:
            eigenschaften (dict): {MU: int, KL: int, IN: int, CH: int, ...}
            current_kap (int): Aktuelle Karmapunkte
            tradition (str, optional): Tradition des Geweihten
        target_data: Zieldaten (optional) mit:
            sk (int, optional): Seelenkraft
            zk (int, optional): Zähigkeit
        rolls: 3 Würfelergebnisse (je 1-20). Wenn None, wird keine Probe gewürfelt.
        difficulty: Erschwernis/Erleichterung der Probe.

    Returns:
        dict mit:
            success (bool): Liturgie gelungen
            qs (int): Qualitätsstufe (0 bei Misserfolg)
            kap_cost (int): Tatsächlich verbrauchte KaP
            kap_affordable (bool): Ob genug KaP vorhanden waren
            effect (dict|None): Berechneter Effekt bei Erfolg
            probe_result (dict|None): Ergebnis der 3W20-Probe
            liturgy_name (str): Name der Liturgie
    """
    liturgy_name = liturgy_data.get("name", "Unbekannte Liturgie")
    base_kap_cost = liturgy_data.get("kap_cost", 0)
    probe_attributes = liturgy_data.get("probe", [])
    fw = liturgy_data.get("fw", 0)

    # KaP-Kosten prüfen
    current_kap = blessed_data.get("current_kap", 0)
    if not check_kap_cost(current_kap, base_kap_cost):
        return {
            "success": False,
            "qs": 0,
            "kap_cost": 0,
            "kap_affordable": False,
            "effect": None,
            "probe_result": None,
            "liturgy_name": liturgy_name,
        }

    # Eigenschaftswerte für die Probe ermitteln
    eigenschaften = blessed_data.get("eigenschaften", {})
    attributes = []
    for attr_key in probe_attributes:
        attr_value = eigenschaften.get(attr_key, 8)  # Fallback: 8
        attributes.append(attr_value)

    if len(attributes) != 3:
        raise ValueError(f"Liturgie benötigt genau 3 Probeneigenschaften, "
                         f"hat aber {len(attributes)}: {probe_attributes}")

    # Widerstands-Erschwernis durch Ziel-SK/ZK
    target_resistance = 0
    if target_data:
        if liturgy_data.get("resistance_type") == "SK":
            target_sk = target_data.get("sk", 0)
            caster_sk = blessed_data.get("sk", 0)
            target_resistance = -(target_sk - caster_sk) if target_sk > caster_sk else 0
        elif liturgy_data.get("resistance_type") == "ZK":
            target_zk = target_data.get("zk", 0)
            caster_zk = blessed_data.get("zk", 0)
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
        success = False
        qs = 0

    # KaP-Kosten berechnen
    if success:
        kap_cost = base_kap_cost
        kap_per_qs = liturgy_data.get("kap_cost_per_qs", 0)
        if kap_per_qs:
            kap_cost += kap_per_qs * qs
    else:
        # Bei Misserfolg: halbe Kosten (aufgerundet)
        kap_cost = -(-base_kap_cost // 2)

    # Effekt berechnen
    effect = None
    if success:
        effect = calculate_liturgy_effect(liturgy_data, qs)

    return {
        "success": success,
        "qs": qs,
        "kap_cost": kap_cost,
        "kap_affordable": True,
        "effect": effect,
        "probe_result": probe_result,
        "liturgy_name": liturgy_name,
    }


def check_kap_cost(current_kap: int, cost: int) -> bool:
    """Prüft ob der Geweihte genug Karmapunkte (KaP) hat.

    Args:
        current_kap: Aktuelle Karmapunkte.
        cost: Benötigte KaP.

    Returns:
        True wenn genug KaP vorhanden sind.
    """
    return current_kap >= cost


def calculate_liturgy_effect(liturgy_data: dict, qs: int) -> dict:
    """Berechnet den Effekt einer Liturgie basierend auf der QS.

    Unterstützte Effekttypen (analog zu Zaubern):
    - damage: Schadensliturgien
    - condition: Zustandsliturgien
    - buff: Segnungen/Verstärkungen
    - heal: Heilungsliturgien

    Args:
        liturgy_data: Liturgiedaten mit effect-Dict.
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
    effect_data = liturgy_data.get("effect", {})

    result = {
        "damage": None,
        "condition": None,
        "buff": None,
        "heal": None,
        "duration": liturgy_data.get("wirkungsdauer"),
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
