"""DSA5 reference / databank template models.

These tables hold the static game-data templates (creatures, weapons, armor,
items, spells, liturgies, special abilities, talents, and rules snippets).
Primary keys are human-readable string IDs so seed data can be referenced
deterministically.

User-contributed entries set is_custom=True with created_by_user_id/username.
System-seeded entries have is_custom=False, created_by_user_id=NULL.
"""

from typing import Optional

from sqlalchemy import String, Text, Integer, Float, Boolean, ForeignKey
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


# ---------------------------------------------------------------------------
# SpeciesTemplate
# ---------------------------------------------------------------------------

class SpeciesTemplate(Base):
    __tablename__ = "species_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    name_en: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    optolith_id: Mapped[Optional[str]] = mapped_column(String(16), nullable=True,
        comment="Optolith reference ID (e.g. R_1)")
    ap_cost: Mapped[int] = mapped_column(Integer, default=0)
    lep_base: Mapped[int] = mapped_column(Integer, default=5,
        comment="Species LeP base value added to (2*KO)")
    sk_base: Mapped[int] = mapped_column(Integer, default=-5,
        comment="Species SK base modifier (added to (MU+KL+IN)/6)")
    zk_base: Mapped[int] = mapped_column(Integer, default=-5,
        comment="Species ZK base modifier (added to (KO+KO+KK)/6)")
    base_attributes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    attribute_adjustments: Mapped[Optional[list]] = mapped_column(JSON, nullable=True,
        comment="Fixed attribute adjustments, e.g. [{'attr': 'KO', 'value': 1}]")
    free_attribute_points: Mapped[int] = mapped_column(Integer, default=7)
    gs_base: Mapped[int] = mapped_column(Integer, default=8)
    magic_capable: Mapped[bool] = mapped_column(Boolean, default=False)
    blessed_capable: Mapped[bool] = mapped_column(Boolean, default=True)
    sk_modifier: Mapped[int] = mapped_column(Integer, default=-2)
    zk_modifier: Mapped[int] = mapped_column(Integer, default=-2)
    common_cultures: Mapped[Optional[list]] = mapped_column(JSON, nullable=True,
        comment="List of common culture IDs for this species")
    auto_advantages: Mapped[Optional[list]] = mapped_column(JSON, nullable=True,
        comment="Automatically granted advantages")
    special_rules: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<SpeciesTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# CultureTemplate
# ---------------------------------------------------------------------------

class CultureTemplate(Base):
    __tablename__ = "culture_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    optolith_id: Mapped[Optional[str]] = mapped_column(String(16), nullable=True,
        comment="Optolith reference ID (e.g. C_8)")
    ap_cost: Mapped[int] = mapped_column(Integer, default=0)
    compatible_species: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    skill_bonuses: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    languages: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    scripts: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    source_book: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<CultureTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# ProfessionTemplate
# ---------------------------------------------------------------------------

class ProfessionTemplate(Base):
    __tablename__ = "profession_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    name_f: Mapped[Optional[str]] = mapped_column(String(128), nullable=True,
        comment="Feminine form of the profession name")
    optolith_id: Mapped[Optional[str]] = mapped_column(String(16), nullable=True,
        comment="Optolith reference ID (e.g. P_9)")
    ap_cost: Mapped[int] = mapped_column(Integer, default=0)
    compatible_species: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    requires_magic: Mapped[bool] = mapped_column(Boolean, default=False)
    requires_blessed: Mapped[bool] = mapped_column(Boolean, default=False)
    combat_techniques: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    skills: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    special_abilities: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    spells: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    liturgies: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    source_book: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<ProfessionTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# CreatureTemplate
# ---------------------------------------------------------------------------

class CreatureTemplate(Base):
    __tablename__ = "creature_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    size: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    token_size: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    attributes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    combat_values: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="LeP, AsP, KaP, SK, ZK, INI_basis, GS, AW, RS, Schip",
    )
    attacks: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    special_rules: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    immunities: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    vulnerabilities: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    behavior: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    flee_threshold: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tactics: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    habitat: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    loot_table_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    guaranteed_loot: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    challenge_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<CreatureTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# WeaponTemplate
# ---------------------------------------------------------------------------

class WeaponTemplate(Base):
    __tablename__ = "weapon_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    combat_technique: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    damage: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    at_mod: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pa_mod: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reach: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    two_handed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    properties: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    damage_type: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    is_ranged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    range_brackets: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    reload_time: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ammunition: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    availability: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<WeaponTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# ArmorTemplate
# ---------------------------------------------------------------------------

class ArmorTemplate(Base):
    __tablename__ = "armor_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    rs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    be: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    zones: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    properties: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<ArmorTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# ShieldTemplate
# ---------------------------------------------------------------------------

class ShieldTemplate(Base):
    __tablename__ = "shield_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    at_mod: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pa_mod: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    size: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<ShieldTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# ItemTemplate
# ---------------------------------------------------------------------------

class ItemTemplate(Base):
    __tablename__ = "item_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stackable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_stack: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    usable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    usable_in_combat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    use_action_cost: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    effects: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    consumable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    charges: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<ItemTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# SpellTemplate
# ---------------------------------------------------------------------------

class SpellTemplate(Base):
    __tablename__ = "spell_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    tradition: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    probe: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    check_mod: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    casting_time: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    asp_cost: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    range: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    duration: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    target: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    effect_per_qs: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    damage: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    condition_inflicted: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    buff_effect: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<SpellTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# LiturgyTemplate
# ---------------------------------------------------------------------------

class LiturgyTemplate(Base):
    __tablename__ = "liturgy_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    tradition: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    probe: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    check_mod: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    casting_time: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    kap_cost: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    range: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    duration: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    target: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    effect_per_qs: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    damage: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    condition_inflicted: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    buff_effect: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<LiturgyTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# SpecialAbilityTemplate
# ---------------------------------------------------------------------------

class SpecialAbilityTemplate(Base):
    __tablename__ = "special_ability_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    prerequisites: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    ap_cost: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    at_mod: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pa_mod: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    damage_modifier: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    combinable_with: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    exclusive_with: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    applicable_techniques: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rules_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<SpecialAbilityTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# TalentTemplate
# ---------------------------------------------------------------------------

class TalentTemplate(Base):
    __tablename__ = "talent_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    probe: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    applications: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    encumbrance: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # User-contribution fields
    created_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def __repr__(self) -> str:
        return f"<TalentTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# CombatTechniqueTemplate
# ---------------------------------------------------------------------------

class CombatTechniqueTemplate(Base):
    __tablename__ = "combat_technique_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    category: Mapped[str] = mapped_column(
        String(16), nullable=False, comment="nahkampf or fernkampf"
    )
    primary_attribute: Mapped[Optional[list]] = mapped_column(
        JSON, nullable=True, comment="Leiteigenschaft: ['KK'] or ['GE','KK']"
    )
    improvement_cost: Mapped[Optional[str]] = mapped_column(
        String(4), nullable=True, comment="Steigerungsfaktor: B, C, or D"
    )
    can_parry: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    parry_restrictions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    special_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<CombatTechniqueTemplate {self.id!r}>"


# ---------------------------------------------------------------------------
# RulesSnippet
# ---------------------------------------------------------------------------

class RulesSnippet(Base):
    __tablename__ = "rules_snippets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    keywords: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    table_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    source_reference: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)

    def __repr__(self) -> str:
        return f"<RulesSnippet {self.id!r}>"
