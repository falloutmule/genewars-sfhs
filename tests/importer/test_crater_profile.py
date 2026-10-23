import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/import-original'))
import crater_profile as c


class CraterProfile(unittest.TestCase):
    def test_identity_is_checked_before_mapping(self):
        for value in (None, 'fixture', b'fixture'):
            with self.assertRaises(ValueError):
                c.import_crater_rules(value)

    def test_only_admitted_nine_cell_fields_are_returned(self):
        rows = (bytes(range(9)), bytes(range(21, 30)))
        ranges = tuple((name, offset, size, c.sha(raw)) for (name, offset, size, _), raw in zip(c.RANGES, rows))
        with patch.object(c, 'EXECUTABLE_SHA256', c.sha(b'fixture')), patch.object(c, 'RANGES', ranges), patch.object(c, 'LEImage') as image:
            image.return_value.read_object.side_effect = rows
            result = c.import_crater_rules(b'fixture')
        self.assertEqual(result['largeTextures'], list(range(9)))
        self.assertEqual(result['largeFlags'], list(range(21, 30)))
        self.assertFalse(result['provenance']['originalExecution'])
        self.assertEqual(result['provenance']['ranges']['largeTextures']['bytes'], 9)
        self.assertEqual(image.return_value.read_object.call_args_list[1].args, (3, 0x4B50, 9))

    def test_changed_original_range_is_rejected(self):
        with patch.object(c, 'EXECUTABLE_SHA256', c.sha(b'fixture')), patch.object(c, 'LEImage') as image:
            image.return_value.read_object.return_value = bytes(9)
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                c.import_crater_rules(b'fixture')


if __name__ == '__main__':
    unittest.main()
