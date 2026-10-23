import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/import-original'))
import strategic_engineer_profile as profile


class StrategicEngineerProfile(unittest.TestCase):
    def test_exact_unsigned_rows_and_provenance(self):
        raw = bytes([0, 128, 255] * 14)
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), \
                patch.object(profile, 'PRIORITY_SHA256', profile.sha(raw)), \
                patch.object(profile, 'LEImage') as mapper:
            mapper.return_value.read_object.return_value = raw
            result = profile.import_strategic_engineer_rules(memoryview(b'fixture'))
            mapper.return_value.read_object.assert_called_once_with(3, 0x79A0, 42)
        self.assertEqual(result['priorities'], [[0, 128, 255]] * 14)
        self.assertFalse(result['provenance']['originalExecution'])
        self.assertEqual(result['provenance']['priorities']['virtualAddress'], 0x1079A0)
        self.assertEqual(result['provenance']['priorities']['sha256'], profile.sha(raw))

    def test_rejects_foreign_and_oversized_before_mapping(self):
        with patch.object(profile, 'LEImage') as mapper, patch.object(profile, 'MAX_FILE_BYTES', 8):
            for raw in (None, 'fixture', b'foreign', bytes(9)):
                with self.subTest(kind=type(raw).__name__), self.assertRaisesRegex(ValueError, 'variant'):
                    profile.import_strategic_engineer_rules(raw)
            mapper.assert_not_called()

    def test_rejects_changed_and_out_of_bounds_ranges(self):
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), \
                patch.object(profile, 'LEImage') as mapper:
            for raw in (bytes(41), bytes(42), bytes(43)):
                mapper.return_value.read_object.return_value = raw
                with self.subTest(size=len(raw)), self.assertRaisesRegex(ValueError, 'hash/extent'):
                    profile.import_strategic_engineer_rules(b'fixture')
            mapper.return_value.read_object.side_effect = ValueError('LE object bound')
            with self.assertRaisesRegex(ValueError, 'object bound'):
                profile.import_strategic_engineer_rules(b'fixture')


if __name__ == '__main__':
    unittest.main()
