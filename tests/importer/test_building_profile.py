import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'tools/import-original'))
import building_profile as b

def fixture():
    rows = []
    for selector in (i for i in range(14) if i != 9):
        name = ('synthetic/B%d.ANB' % selector).encode('ascii')
        rows.append(name.ljust(28, b'\0') + struct.pack('<I', 0x16824 + 4*selector) + bytes(12))
    return b''.join(reversed(rows)), bytes(range(14)), struct.pack('<hh', -32768, 32767)

class BuildingProfile(unittest.TestCase):
    def test_rejects_unrecognized_identity_before_reading(self):
        with patch.object(b, 'LEImage') as image:
            for value in (None, 'fixture', b'fixture'):
                with self.assertRaises(ValueError): b.import_building_rules(value)
            image.assert_not_called()

    def admit(self, raw):
        return (patch.object(b, 'EXECUTABLE_SHA256', b.sha(b'fixture')),
                patch.object(b, 'DESCRIPTORS_SHA256', b.sha(raw[0])),
                patch.object(b, 'UPKEEP_SHA256', b.sha(raw[1])),
                patch.object(b, 'FRONT_SHA256', b.sha(raw[2])))

    def test_resource_selectors_come_from_relocation_destination_not_descriptor_order(self):
        raw = fixture()
        p1,p2,p3,p4 = self.admit(raw)
        with p1,p2,p3,p4,patch.object(b, 'LEImage') as image:
            image.return_value.read_object.side_effect = raw
            result = b.import_building_rules(b'fixture')
        self.assertEqual(result['unsupportedSelectors'], [9])
        self.assertEqual(result['resources'][4], {'selector':4,'assetKey':'B4','path':'synthetic/B4.ANB'})
        self.assertEqual(result['upkeep'], list(range(14)))
        self.assertEqual(result['processingFrontOffset'], [-32768, 32767])
        self.assertFalse(result['provenance']['originalExecution'])
        self.assertEqual([call.args for call in image.return_value.read_object.call_args_list],
                         [(3,0x393C,572),(3,0x4D10,14),(3,0x457C,4)])

    def test_every_source_span_hash_is_required(self):
        raw = fixture()
        for index in range(3):
            p1,p2,p3,p4 = self.admit(raw)
            corrupted = list(raw); corrupted[index] = bytes(len(raw[index]))
            with p1,p2,p3,p4,patch.object(b, 'LEImage') as image:
                image.return_value.read_object.side_effect = corrupted
                with self.assertRaisesRegex(ValueError, 'span hash mismatch'): b.import_building_rules(b'fixture')

    def test_rejects_invalid_and_duplicate_resource_destinations(self):
        original = fixture()
        for destination in (0x16825, 0x16824 + 14*4, 0x16824):
            raw = list(original); altered = bytearray(raw[0]); struct.pack_into('<I', altered, 28, destination); raw[0] = bytes(altered)
            p1,p2,p3,p4 = self.admit(raw)
            with p1,p2,p3,p4,patch.object(b, 'LEImage') as image:
                image.return_value.read_object.side_effect = raw
                with self.assertRaisesRegex(ValueError, 'destination|duplicate'): b.import_building_rules(b'fixture')

    def test_rejects_path_traversal_even_with_explicit_synthetic_hash(self):
        raw = list(fixture()); altered = bytearray(raw[0]); altered[:28] = b'../private.ANB'.ljust(28,b'\0'); raw[0] = bytes(altered)
        p1,p2,p3,p4 = self.admit(raw)
        with p1,p2,p3,p4,patch.object(b, 'LEImage') as image:
            image.return_value.read_object.side_effect = raw
            with self.assertRaisesRegex(ValueError, 'unsafe'): b.import_building_rules(b'fixture')

if __name__ == '__main__': unittest.main()
