import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'tools/import-original'))
import shepherd_profile as s

class ShepherdProfile(unittest.TestCase):
    def test_rejects_unknown_identity_before_reading(self):
        with patch.object(s, 'LEImage') as image:
            for data in (None, 'fixture', b'fixture'):
                with self.assertRaises(ValueError): s.import_shepherd_rules(data)
            image.assert_not_called()

    def test_imports_all_seven_signed_rows_and_unsigned_codes(self):
        data = b''.join(struct.pack('<hhhB', -32768+i, 32767-i, -i, 249+i) for i in range(7))
        with patch.object(s, 'EXECUTABLE_SHA256', s.sha(b'fixture')), patch.object(s, 'PROFILE_SHA256', s.sha(data)), patch.object(s, 'LEImage') as image:
            image.return_value.read_object.return_value = data
            result = s.import_shepherd_rules(b'fixture')
            image.return_value.read_object.assert_called_once_with(3, 0x4AB4, 49)
        self.assertEqual(result['projectiles'][0], {'speedWord':-32768,'rangeFactor':32767,'cooldown':0,'effectCode':249})
        self.assertEqual(result['projectiles'][6]['effectCode'], 255)
        self.assertFalse(result['provenance']['originalExecution'])

    def test_refuses_mutated_table(self):
        with patch.object(s, 'EXECUTABLE_SHA256', s.sha(b'fixture')), patch.object(s, 'LEImage') as image:
            image.return_value.read_object.return_value = bytes(49)
            with self.assertRaisesRegex(ValueError, 'hash mismatch'): s.import_shepherd_rules(b'fixture')

if __name__ == '__main__': unittest.main()
