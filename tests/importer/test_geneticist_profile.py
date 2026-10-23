import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/import-original'))
import geneticist_profile as g

class GeneticistProfile(unittest.TestCase):
    def test_rejects_identity_before_reading(self):
        for value in (None,'fixture',b'fixture'):
            with self.assertRaises(ValueError): g.import_geneticist_rules(value)
    def test_signed_profile_fields_and_unsigned_effect_codes(self):
        raw=b''.join(struct.pack('<hhhB',*row) for row in ((-32768,32767,-1,255),(1,2,3,4),(5,6,7,8)))
        with patch.object(g,'EXECUTABLE_SHA256',g.sha(b'fixture')),patch.object(g,'PROFILE_SHA256',g.sha(raw)),patch.object(g,'LEImage') as image:
            image.return_value.read_object.return_value=raw
            result=g.import_geneticist_rules(b'fixture')
            image.return_value.read_object.assert_called_once_with(3,0x4AD0,21)
        self.assertEqual(result['projectiles'][0],{'speedWord':-32768,'rangeFactor':32767,'cooldown':-1,'effectCode':255})
        self.assertEqual(len(result['projectiles']),3)
        self.assertFalse(result['provenance']['originalExecution'])
    def test_rejects_mutated_numeric_profile(self):
        with patch.object(g,'EXECUTABLE_SHA256',g.sha(b'fixture')),patch.object(g,'LEImage') as image:
            image.return_value.read_object.return_value=bytes(21)
            with self.assertRaisesRegex(ValueError,'hash mismatch'):g.import_geneticist_rules(b'fixture')

if __name__=='__main__':unittest.main()
