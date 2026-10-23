import sys
import struct
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/import-original'))
import strategic_ai_profile as profile


class StrategicAIProfile(unittest.TestCase):
    def test_imports_exact_unsigned_numeric_group_limits_with_provenance(self):
        data = bytes([0, 1, 127, 128, 254, 255])
        genes = bytes(range(50))
        weights = bytes(range(125))
        values = struct.pack('<42h', *range(-21, 21))
        threats = struct.pack('<42h', *range(-32768, -32726))
        specialists = bytes([0, 100, 200, 255])
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), \
                patch.object(profile, 'GROUP_LIMITS_SHA256', profile.sha(data)), \
                patch.object(profile, 'SPECIES_GENES_SHA256', profile.sha(genes)), \
                patch.object(profile, 'PRODUCTION_WEIGHTS_SHA256', profile.sha(weights)), \
                patch.object(profile, 'BUILDING_VALUES_SHA256', profile.sha(values)), \
                patch.object(profile, 'BUILDING_THREAT_SHA256', profile.sha(threats)), \
                patch.object(profile, 'SPECIALIST_THREAT_SHA256', profile.sha(specialists)), \
                patch.object(profile, 'LEImage') as mapper:
            mapper.return_value.read_object.side_effect = [data, genes, weights, values, threats, specialists]
            result = profile.import_strategic_ai_rules(memoryview(b'fixture'))
            self.assertEqual([c.args for c in mapper.return_value.read_object.call_args_list],
                             [(3, 0x79D4, 6), (3, 0x4A64, 50), (3, 0x79F8, 125), (3, 0x78F8, 84), (3, 0x794C, 84), (3, 0x79D0, 4)])
        self.assertEqual(result['schemaVersion'], 1)
        self.assertEqual(result['groupLimits'], list(data))
        self.assertFalse(result['provenance']['originalExecution'])
        self.assertEqual(result['provenance']['groupLimits']['virtualAddress'], 0x1079D4)
        self.assertEqual(result['provenance']['groupLimits']['bytes'], 6)
        self.assertEqual(result['provenance']['groupLimits']['sha256'], profile.sha(data))
        self.assertEqual(result['speciesGenes'], [list(genes[i:i + 2]) for i in range(0, 50, 2)])
        self.assertEqual(result['productionWeights'], [list(weights[i:i + 5]) for i in range(0, 125, 5)])
        self.assertEqual(result['provenance']['speciesGenes']['bytes'], 50)
        self.assertEqual(result['provenance']['productionWeights']['bytes'], 125)
        self.assertEqual(result['buildingValues'], [list(range(i, i + 3)) for i in range(-21, 21, 3)])
        self.assertEqual(result['provenance']['buildingValues']['bytes'], 84)
        self.assertEqual(result['buildingThreatValues'][0], [-32768, -32767, -32766])
        self.assertEqual(result['specialistThreatWeights'], list(specialists))

    def test_rejects_foreign_nonbytes_and_oversized_inputs_before_mapping(self):
        with patch.object(profile, 'LEImage') as mapper, patch.object(profile, 'MAX_FILE_BYTES', 8):
            for value in (None, 'fixture', b'foreign', bytes(9)):
                with self.subTest(value=type(value).__name__), self.assertRaisesRegex(ValueError, 'variant'):
                    profile.import_strategic_ai_rules(value)
            mapper.assert_not_called()

    def test_rejects_changed_table_and_truncated_mapper_extent(self):
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), \
                patch.object(profile, 'LEImage') as mapper:
            for raw in (bytes(6), bytes(5), bytes(7)):
                mapper.return_value.read_object.return_value = raw
                with self.subTest(length=len(raw)), self.assertRaisesRegex(ValueError, 'hash/extent'):
                    profile.import_strategic_ai_rules(b'fixture')

    def test_propagates_numeric_object_mapping_bounds_error(self):
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), \
                patch.object(profile, 'LEImage') as mapper:
            mapper.return_value.read_object.side_effect = ValueError('LE object bound')
            with self.assertRaisesRegex(ValueError, 'object bound'):
                profile.import_strategic_ai_rules(b'fixture')

    def test_rejects_changed_genes_or_weights_after_admitted_earlier_tables(self):
        limits, genes, weights = bytes(6), bytes(50), bytes(125)
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), \
                patch.object(profile, 'GROUP_LIMITS_SHA256', profile.sha(limits)), \
                patch.object(profile, 'SPECIES_GENES_SHA256', profile.sha(genes)), \
                patch.object(profile, 'PRODUCTION_WEIGHTS_SHA256', profile.sha(weights)), \
                patch.object(profile, 'LEImage') as mapper:
            mapper.return_value.read_object.side_effect = [limits, bytes(49)]
            with self.assertRaisesRegex(ValueError, 'speciesGenes'):
                profile.import_strategic_ai_rules(b'fixture')
            mapper.return_value.read_object.side_effect = [limits, genes, bytes(124)]
            with self.assertRaisesRegex(ValueError, 'productionWeights'):
                profile.import_strategic_ai_rules(b'fixture')

    def test_rejects_each_changed_settlement_value_or_threat_range(self):
        ranges = [bytes(6), bytes(50), bytes(125), bytes(84), bytes(84), bytes(4)]
        names = ['GROUP_LIMITS_SHA256', 'SPECIES_GENES_SHA256', 'PRODUCTION_WEIGHTS_SHA256',
                 'BUILDING_VALUES_SHA256', 'BUILDING_THREAT_SHA256', 'SPECIALIST_THREAT_SHA256']
        from contextlib import ExitStack
        with ExitStack() as stack:
            stack.enter_context(patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')))
            for name, raw in zip(names, ranges):
                stack.enter_context(patch.object(profile, name, profile.sha(raw)))
            mapper = stack.enter_context(patch.object(profile, 'LEImage'))
            for index, name in [(3, 'buildingValues'), (4, 'buildingThreatValues'), (5, 'specialistThreatWeights')]:
                with self.subTest(name=name), self.assertRaisesRegex(ValueError, name):
                    mapper.return_value.read_object.side_effect = ranges[:index] + [ranges[index][:-1]]
                    profile.import_strategic_ai_rules(b'fixture')


if __name__ == '__main__':
    unittest.main()
