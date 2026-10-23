import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'tools/import-original'))
import ethereal_profile as e


class EtherealProfile(unittest.TestCase):
    def test_admits_signed_numeric_thresholds_without_execution(self):
        raw=struct.pack('<3i', -20, 0, 100)
        with patch.object(e, 'EXECUTABLE_SHA256', e.sha(b'fixture')), \
                patch.object(e, 'THRESHOLDS_SHA256', e.sha(raw)), \
                patch.object(e, 'LEImage') as mapper:
            mapper.return_value.read_object.return_value=raw
            result=e.import_ethereal_rules(b'fixture')
            mapper.return_value.read_object.assert_called_once_with(3,0x2E2C,12)
        self.assertEqual(result['observationThresholds'],[-20,0,100])
        self.assertFalse(result['provenance']['originalExecution'])

    def test_rejects_foreign_identity_and_changed_table(self):
        with patch.object(e,'LEImage') as mapper:
            with self.assertRaisesRegex(ValueError,'variant'):
                e.import_ethereal_rules(b'unknown')
            mapper.assert_not_called()
        with patch.object(e,'EXECUTABLE_SHA256',e.sha(b'fixture')),patch.object(e,'LEImage') as mapper:
            mapper.return_value.read_object.return_value=bytes(12)
            with self.assertRaisesRegex(ValueError,'hash mismatch'):
                e.import_ethereal_rules(b'fixture')
