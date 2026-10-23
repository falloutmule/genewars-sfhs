"""Hash-admitted Geneticist projectile numeric profile; no execution."""
import struct
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

PROFILE_SHA256 = '575d8d96052769d6f57b96437a4d1281eeba23f034115bdf53deacc1e091cce1'

def import_geneticist_rules(executable_bytes):
    if not isinstance(executable_bytes, (bytes,bytearray,memoryview)):
        raise ValueError('geneticist input must be executable bytes')
    if len(executable_bytes)>MAX_FILE_BYTES or sha(executable_bytes)!=EXECUTABLE_SHA256:
        raise ValueError('unrecognized geneticist executable variant')
    raw=LEImage(executable_bytes).read_object(3,0x4AD0,21)
    if sha(raw)!=PROFILE_SHA256:
        raise ValueError('geneticist projectile table hash mismatch')
    rows=[]
    for index in range(3):
        speed,scale,cooldown,code=struct.unpack_from('<hhhB',raw,index*7)
        rows.append({'speedWord':speed,'rangeFactor':scale,'cooldown':cooldown,'effectCode':code})
    return {'schemaVersion':1,'projectiles':rows,'provenance':{
        'executableSha256':EXECUTABLE_SHA256,'originalExecution':False,
        'object':3,'objectOffset':0x4AD0,'bytes':21,'sha256':PROFILE_SHA256}}
