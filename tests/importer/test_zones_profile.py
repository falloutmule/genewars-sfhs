"""Synthetic importer tests. Original fixtures stay private and optional."""
import hashlib
import os
import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tools/import-original'))
import zones_profile
from sources import Source


class ZonesProfile(unittest.TestCase):
    def test_maps_only_the_admitted_numeric_ranges(self):
        executable = b'synthetic LE identity'
        genes = bytes(value % 5 for value in range(50))
        labels = bytes(range(14))
        light = struct.pack('<3i', -11, 22, -33)
        records = [genes, labels, light]
        tables = tuple((name, offset, len(data), hashlib.sha256(data).hexdigest())
                       for (name, offset, _, _), data in zip(zones_profile.TABLES, records))
        class FakeImage:
            def __init__(self, raw): self.raw = raw
            def read_object(self, obj, offset, size):
                self.asserted = (obj, offset, size)
                return next(data for table, data in zip(tables, records) if table[1:3] == (offset, size) and obj == 3)
        with patch.object(zones_profile, 'EXECUTABLE_SHA256', hashlib.sha256(executable).hexdigest()), patch.object(zones_profile, 'LEImage', FakeImage), patch.object(zones_profile, 'TABLES', tables):
            result = zones_profile.import_zone_rules(executable)
        self.assertEqual(len(result['speciesComponents']), 25)
        self.assertEqual(result['speciesComponents'][0], [0, 1])
        self.assertEqual(result['zoneTextIndices'], list(range(14)))
        self.assertEqual(result['terrainLightVector'], [-11, 22, -33])
        self.assertFalse(result['provenance']['originalExecution'])
        self.assertEqual(result['provenance']['tables']['terrainLightVector']['bytes'], 12)

    def test_refuses_foreign_identity_before_mapping(self):
        with patch.object(zones_profile, 'LEImage') as mapper:
            with self.assertRaisesRegex(ValueError, 'variant'):
                zones_profile.import_zone_rules(b'unknown')
            mapper.assert_not_called()

    def test_refuses_changed_numeric_bytes(self):
        executable = b'synthetic'
        with patch.object(zones_profile, 'EXECUTABLE_SHA256', hashlib.sha256(executable).hexdigest()), patch.object(zones_profile, 'LEImage') as mapper:
            mapper.return_value.read_object.return_value = bytes(50)
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                zones_profile.import_zone_rules(executable)

    @unittest.skipUnless(os.environ.get('GENEWARS_ZONE_SOURCE'), 'private original source not configured')
    def test_private_original_profile(self):
        source = Source(os.environ['GENEWARS_ZONE_SOURCE'])
        try:
            result = zones_profile.import_zone_rules(source.read(source.find('GW.EXE')))
        finally:
            source.close()
        self.assertEqual(len(result['speciesComponents']), 25)
        self.assertEqual(result['speciesComponents'][4], [4, 4])
        self.assertEqual(len(result['zoneTextIndices']), 14)
        self.assertEqual(len(result['terrainLightVector']), 3)


if __name__ == '__main__':
    unittest.main()
