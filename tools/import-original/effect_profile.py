"""Hash-admitted shared effect descriptors; numeric metadata, no execution."""
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

TABLE_SHA256 = '7551505ae0f964a459aad44f6d60bb3acbb311fd831c33186fb0895a8e2f893c'

def import_effect_rules(executable_bytes):
    if not isinstance(executable_bytes,(bytes,bytearray,memoryview)):
        raise ValueError('effect input must be executable bytes')
    if len(executable_bytes)>MAX_FILE_BYTES or sha(executable_bytes)!=EXECUTABLE_SHA256:
        raise ValueError('unrecognized effect executable variant')
    raw=LEImage(executable_bytes).read_object(3,0x4EB4,426)
    if sha(raw)!=TABLE_SHA256:
        raise ValueError('shared effect descriptor table hash mismatch')
    rows=[]
    for code in range(71):
        mode,gravity,priority,child,movable,water=raw[code*6:code*6+6]
        rows.append({'code':code,'retirementMode':mode,'gravity':bool(gravity),
            'priority':priority,'childCode':None if child==255 else child,
            'movable':bool(movable),'waterResponse':bool(water)})
    return {'schemaVersion':1,'descriptors':rows,'provenance':{
        'executableSha256':EXECUTABLE_SHA256,'originalExecution':False,
        'object':3,'objectOffset':0x4EB4,'bytes':426,'sha256':TABLE_SHA256}}
