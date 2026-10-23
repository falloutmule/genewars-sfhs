import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/import-original'))
import creature_command_profile as profile


class CreatureCommandProfile(unittest.TestCase):
    def test_signed_offset_and_provenance(self):
        raw = bytes([0, 128, 255, 127])
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), \
                patch.object(profile, 'OFFSET_SHA256', profile.sha(raw)), \
                patch.object(profile, 'SEARCH_ORDER_SHA256', profile.sha(bytes(range(9)))), \
                patch.object(profile, 'SEARCH_VALUES_SHA256', profile.sha(raw * 9)), \
                patch.object(profile, 'LEImage') as mapper:
            mapper.return_value.read_object.side_effect = [raw, bytes(range(9))] + [raw] * 9
            result = profile.import_creature_command_rules(memoryview(b'fixture'))
            self.assertEqual(mapper.return_value.read_object.call_args_list[0].args, (3, 0x457C, 4))
            self.assertEqual(mapper.return_value.read_object.call_args_list[-1].args, (3, 0x4564 + 8 * 4, 4))
        self.assertEqual(result['corpseDepositOffset'], [-32768, 32767])
        self.assertFalse(result['provenance']['originalExecution'])
        self.assertEqual(result['provenance']['corpseDepositOffset']['sha256'], profile.sha(raw))
        self.assertEqual(result['footprintSearchOffsets'], [[-32768, 32767]] * 9)

    def test_foreign_and_oversized_refused_before_mapping(self):
        with patch.object(profile, 'LEImage') as mapper, patch.object(profile, 'MAX_FILE_BYTES', 8):
            for raw in (None, 'fixture', b'foreign', bytes(9)):
                with self.subTest(kind=type(raw).__name__), self.assertRaisesRegex(ValueError, 'variant'):
                    profile.import_creature_command_rules(raw)
            mapper.assert_not_called()

    def test_changed_or_truncated_range_rejected(self):
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), patch.object(profile, 'LEImage') as mapper:
            for raw in (bytes(3), bytes(4), bytes(5)):
                mapper.return_value.read_object.return_value = raw
                with self.subTest(size=len(raw)), self.assertRaisesRegex(ValueError, 'hash/extent'):
                    profile.import_creature_command_rules(b'fixture')
            mapper.return_value.read_object.side_effect = ValueError('LE object bound')
            with self.assertRaisesRegex(ValueError, 'object bound'):
                profile.import_creature_command_rules(b'fixture')

    def test_search_order_and_each_indexed_value_are_admitted(self):
        raw, order = bytes(4), bytes([255] + list(range(8)))
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), \
                patch.object(profile, 'OFFSET_SHA256', profile.sha(raw)), \
                patch.object(profile, 'SEARCH_ORDER_SHA256', profile.sha(order)), \
                patch.object(profile, 'SEARCH_VALUES_SHA256', profile.sha(raw * 9)), \
                patch.object(profile, 'LEImage') as mapper:
            mapper.return_value.read_object.side_effect = [raw, order] + [raw] * 9
            result = profile.import_creature_command_rules(b'fixture')
            self.assertEqual(result['footprintSearchOffsets'], [[0, 0]] * 9)
            self.assertEqual(mapper.return_value.read_object.call_args_list[2].args, (3, 0x4564 + 255 * 4, 4))
            for values in ([raw, bytes(8)], [raw, order, bytes(3)] + [raw] * 8, [raw, order] + [raw] * 8 + [bytes(5)]):
                mapper.return_value.read_object.side_effect = values
                with self.assertRaisesRegex(ValueError, 'hash/extent'):
                    profile.import_creature_command_rules(b'fixture')
