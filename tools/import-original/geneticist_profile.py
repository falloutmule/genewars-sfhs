"""Hash-admitted Geneticist projectile numeric profile; no execution."""
import struct
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

PROFILE_SHA256 = '575d8d96052769d6f57b96437a4d1281eeba23f034115bdf53deacc1e091cce1'
REVEAL_OFFSETS = (0x4AEC, 0x4AFC, 0x4B0C, 0x4B1C)
REVEAL_SHA256 = '2d5bc62eabe8e715b61cff309e65bbd852fc04477c710600e30d78b9de3ff0e4'
DESCRIPTOR_SPANS = (
    (20, 0x4F2C, 6, '4c36b4fe514235396adc275a09330b023ee3faf13c20c8d7564080cfa3c1cd9b'),
    (41, 0x4FAA, 18, '26d6648b545ca129ad6b17685b5ba69b8e32c88a5a48c5bfd524718c792dc8ac'),
)

def import_geneticist_rules(executable_bytes):
    if not isinstance(executable_bytes, (bytes,bytearray,memoryview)):
        raise ValueError('geneticist input must be executable bytes')
    if len(executable_bytes)>MAX_FILE_BYTES or sha(executable_bytes)!=EXECUTABLE_SHA256:
        raise ValueError('unrecognized geneticist executable variant')
    image=LEImage(executable_bytes)
    raw=image.read_object(3,0x4AD0,21)
    if sha(raw)!=PROFILE_SHA256:
        raise ValueError('geneticist projectile table hash mismatch')
    rows=[]
    for index in range(3):
        speed,scale,cooldown,code=struct.unpack_from('<hhhB',raw,index*7)
        rows.append({'speedWord':speed,'rangeFactor':scale,'cooldown':cooldown,'effectCode':code})
    descriptors=[]
    spans=[]
    for first,offset,length,expected in DESCRIPTOR_SPANS:
        data=image.read_object(3,offset,length)
        if sha(data)!=expected:
            raise ValueError('geneticist effect descriptor hash mismatch')
        for index in range(length//6):
            completion,gravity,priority,child,obstacle,water=data[index*6:index*6+6]
            if any(value not in (0,1) for value in (gravity,obstacle,water)):
                raise ValueError('invalid geneticist descriptor boolean')
            descriptors.append({'code':first+index,'completion':completion,
                'gravity':bool(gravity),'priority':priority,
                'childCode':None if child==255 else child,
                'obstacle':bool(obstacle),'water':bool(water)})
        spans.append({'object':3,'objectOffset':offset,'bytes':length,'sha256':expected})
    reveal=b''.join(image.read_object(3,offset,4) for offset in REVEAL_OFFSETS)
    if sha(reveal)!=REVEAL_SHA256:
        raise ValueError('geneticist reveal radius cells hash mismatch')
    radii=list(struct.unpack('<4i',reveal))
    return {'schemaVersion':1,'projectiles':rows,'effectDescriptors':descriptors,'revealRadii':radii,'provenance':{
        'executableSha256':EXECUTABLE_SHA256,'originalExecution':False,
        'object':3,'objectOffset':0x4AD0,'bytes':21,'sha256':PROFILE_SHA256,
        'effectDescriptorSpans':spans,
        'revealRadiusCells':{'object':3,'objectOffsets':list(REVEAL_OFFSETS),'bytes':16,'sha256':REVEAL_SHA256}}}
