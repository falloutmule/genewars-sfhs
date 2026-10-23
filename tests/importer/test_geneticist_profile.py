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
        descriptors=bytes((7,1,2,255,0,1,4,0,0,20,1,1,4,0,0,20,1,1,4,0,0,20,1,1))
        spans=((20,0x4F2C,6,g.sha(descriptors[:6])),(41,0x4FAA,18,g.sha(descriptors[6:])))
        with patch.object(g,'EXECUTABLE_SHA256',g.sha(b'fixture')),patch.object(g,'PROFILE_SHA256',g.sha(raw)),patch.object(g,'DESCRIPTOR_SPANS',spans),patch.object(g,'LEImage') as image:
            image.return_value.read_object.side_effect=(raw,descriptors[:6],descriptors[6:])
            result=g.import_geneticist_rules(b'fixture')
            self.assertEqual(image.return_value.read_object.call_count,3)
        self.assertEqual(result['projectiles'][0],{'speedWord':-32768,'rangeFactor':32767,'cooldown':-1,'effectCode':255})
        self.assertEqual(len(result['projectiles']),3)
        self.assertFalse(result['provenance']['originalExecution'])
        self.assertEqual(result['effectDescriptors'][0],{'code':20,'completion':7,'gravity':True,'priority':2,'childCode':None,'obstacle':False,'water':True})
        self.assertEqual([row['code'] for row in result['effectDescriptors']],[20,41,42,43])
    def test_rejects_mutated_numeric_profile(self):
        with patch.object(g,'EXECUTABLE_SHA256',g.sha(b'fixture')),patch.object(g,'LEImage') as image:
            image.return_value.read_object.return_value=bytes(21)
            with self.assertRaisesRegex(ValueError,'hash mismatch'):g.import_geneticist_rules(b'fixture')

    def test_rejects_mutated_effect_descriptor(self):
        raw=bytes(21)
        with patch.object(g,'EXECUTABLE_SHA256',g.sha(b'fixture')),patch.object(g,'PROFILE_SHA256',g.sha(raw)),patch.object(g,'LEImage') as image:
            image.return_value.read_object.side_effect=(raw,bytes(6))
            with self.assertRaisesRegex(ValueError,'descriptor hash mismatch'):g.import_geneticist_rules(b'fixture')

if __name__=='__main__':unittest.main()
