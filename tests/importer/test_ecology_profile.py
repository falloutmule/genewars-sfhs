import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/import-original'))
import ecology_profile as e


class EcologyProfile(unittest.TestCase):
    def synthetic_tables(self):
        plants = bytearray(384)
        for i in range(12):
            struct.pack_into('<8b', plants, i * 32 + 16, -128, -3, -1, 0, 1, 2, 3, 127)
            plants[i * 32 + 24:i * 32 + 30] = bytes([4, 2, 3, 9, 7, 11])
        directions = struct.pack('<18h', *range(-9, 9))
        resources = bytearray(528)
        for i in range(12):
            name = f'data/plant/fixture{i}.anb'.encode()
            resources[i * 44:i * 44 + len(name)] = name
            struct.pack_into('<I', resources, i * 44 + 28, 0x16894 + 4 * i)
        traits = bytearray(1125)
        row = 4*45
        struct.pack_into('<iBBiiiii', traits, row, 1024, 17, 23, 777, 19001, 81, 161, 21)
        traits[row+0x24] = 7
        traits[row+0x1D:row+0x20] = bytes([31,47,59])
        return [bytes(plants), directions, bytes(resources), struct.pack('<8h', -32768, -1, 0, 1, 2, 3, 4, 32767), bytes(traits), struct.pack('<5b',-128,-1,0,127,-3)]

    def test_admission_checks_identity_before_mapping(self):
        for value in [b'fixture', None, 'not bytes']:
            with self.assertRaises(ValueError):
                e.import_ecology_rules(value)

    def test_hash_admitted_rows_signed_growth_vectors_and_logical_resources(self):
        tables = self.synthetic_tables()
        ranges = tuple((name, offset, size, e.sha(raw)) for (name, offset, size, _), raw in zip(e.RANGES, tables))
        with patch.object(e, 'EXECUTABLE_SHA256', e.sha(b'fixture')), patch.object(e, 'RANGES', ranges), patch.object(e, 'LEImage') as mapped:
            mapped.return_value.read_object.side_effect = tables
            result = e.import_ecology_rules(b'fixture')
        self.assertEqual(result['plants'][11]['growthDeltas'], [-128, -3, -1, 0, 1, 2, 3, 127])
        self.assertEqual(result['plants'][0]['nutrition'], 7)
        self.assertEqual(result['spreadDirections'][0], [-9, -8])
        self.assertEqual(result['plantResources'][11]['assetKey'], 'FIXTURE11')
        self.assertFalse(result['provenance']['originalExecution'])
        self.assertEqual(len(result['provenance']['ranges']), 6)
        self.assertEqual(result['corpseFriction'], [-32768, -1, 0, 1, 2, 3, 4, 32767])
        self.assertEqual(result['muleCombat'], {'queryRadius':1024,'attack':17,'defense':23,'disposition':7,'foodWeights':[31,47,59],'attackChannel':-3})
        self.assertEqual(result['mule']['baseSpeed'],777)
        self.assertEqual(result['mule']['healthRecoveryPeriod'],21)
        self.assertEqual(len(result['speciesTraits']),25)

    def test_range_hash_rejects_mutated_data(self):
        with patch.object(e, 'EXECUTABLE_SHA256', e.sha(b'fixture')), patch.object(e, 'LEImage') as mapped:
            mapped.return_value.read_object.return_value = bytes(384)
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                e.import_ecology_rules(b'fixture')


if __name__ == '__main__':
    unittest.main()
