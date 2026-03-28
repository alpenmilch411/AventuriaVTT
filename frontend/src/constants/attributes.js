/**
 * Shared DSA5 attribute constants — names, colors, gradients, icons.
 * Single source of truth for MU/KL/IN/CH/FF/GE/KO/KK display config.
 */
import { Flame, Brain, Eye, Crown, Hand, Wind, HeartPulse, Hammer } from 'lucide-react'

export const ATTR_NAMES = {
  MU: 'Mut', KL: 'Klugheit', IN: 'Intuition', CH: 'Charisma',
  FF: 'Fingerfertigkeit', GE: 'Gewandtheit', KO: 'Konstitution', KK: 'Körperkraft',
}

export const ATTR_TEXT_COLORS = {
  MU: 'text-red-400', KL: 'text-blue-400', IN: 'text-violet-400', CH: 'text-pink-400',
  FF: 'text-emerald-400', GE: 'text-cyan-400', KO: 'text-orange-400', KK: 'text-amber-400',
}

export const ATTR_COLORS = {
  MU: 'from-red-900/30 to-red-950/10 border-red-800/20',
  KL: 'from-blue-900/30 to-blue-950/10 border-blue-800/20',
  IN: 'from-violet-900/30 to-violet-950/10 border-violet-800/20',
  CH: 'from-pink-900/30 to-pink-950/10 border-pink-800/20',
  FF: 'from-emerald-900/30 to-emerald-950/10 border-emerald-800/20',
  GE: 'from-cyan-900/30 to-cyan-950/10 border-cyan-800/20',
  KO: 'from-orange-900/30 to-orange-950/10 border-orange-800/20',
  KK: 'from-amber-900/30 to-amber-950/10 border-amber-800/20',
}

export const ATTR_ICONS = {
  MU: Flame, KL: Brain, IN: Eye, CH: Crown,
  FF: Hand, GE: Wind, KO: HeartPulse, KK: Hammer,
}
