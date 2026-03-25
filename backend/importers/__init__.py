"""Character and adventure import modules for AventuriaVTT.

Provides parsers for:
- Optolith character JSON exports (desktop character creator)
- DSA Ultimate character JSON exports (mobile app)
- AI-assisted adventure PDF/image extraction

Usage::

    from importers.optolith import OptolithImporter, detect_format
    from importers.dsa_ultimate import DSAUltimateImporter
    from importers.adventure_pdf import AdventurePDFImporter
"""

from importers.optolith import OptolithImporter, detect_format
from importers.dsa_ultimate import DSAUltimateImporter
from importers.adventure_pdf import AdventurePDFImporter

__all__ = [
    "OptolithImporter",
    "DSAUltimateImporter",
    "AdventurePDFImporter",
    "detect_format",
]
