import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/import-original'))
import effect_profile as e

class EffectProfile(unittest.TestCase):
    def test_rejects_identity_before_reading(self):
        for value in (None,'fixture',b'fixture'):
            with self.assertRaises(ValueError):e.import_effect_rules(value)

    def test_retains_all71_descriptor_rows_and_nonzero_flags(self):
        raw=b''.join(bytes((code,2,70-code,255 if code==70 else code+1,3,0)) for code in range(71))
        with patch.object(e,'EXECUTABLE_SHA256',e.sha(b'fixture')),patch.object(e,'TABLE_SHA256',e.sha(raw)),patch.object(e,'LEImage') as image:
            image.return_value.read_object.return_value=raw
            result=e.import_effect_rules(b'fixture')
            image.return_value.read_object.assert_called_once_with(3,0x4EB4,426)
        self.assertEqual(result['descriptors'][70],{'code':70,'retirementMode':70,'gravity':True,
            'priority':0,'childCode':None,'movable':True,'waterResponse':False})
        self.assertEqual(result['descriptors'][0]['childCode'],1)
        self.assertFalse(result['provenance']['originalExecution'])

    def test_refuses_mutated_descriptor_bytes(self):
        with patch.object(e,'EXECUTABLE_SHA256',e.sha(b'fixture')),patch.object(e,'LEImage') as image:
            image.return_value.read_object.return_value=bytes(426)
            with self.assertRaisesRegex(ValueError,'hash mismatch'):e.import_effect_rules(b'fixture')

if __name__=='__main__':unittest.main()
