"""Hash-bound numeric zone rules; never embeds or executes original code."""
import hashlib
import struct

from rules import LEImage, EXECUTABLE_SHA256


#25 creature loader selectors, two genes each; the next hybrid matrix is4A98.
#Zone selectors0..13 are the complete79xxx/7A280 switch domain.
TABLES = (
    ('speciesComponents', 0x4A64, 50, 'a110979272cb3e9924405693ff8833fcfc715ef45e0c7d5b95e1286efcb8df94'),
    ('zoneTextIndices', 0x60C1, 14, 'd95b0954354f99973e6386096fea890b3c4f4c542294b55c7e191500cf428319'),
    ('terrainLightVector', 0x6604, 12, '8598ea7f6acd96a0204b9dc15c01989008745411071e022d12e33afbd03aad47'),
)


def import_zone_rules(executable_bytes):
    digest = hashlib.sha256(executable_bytes).hexdigest()
    if digest != EXECUTABLE_SHA256:
        raise ValueError('Unsupported zone-rule executable variant')
    image = LEImage(executable_bytes)
    result = {'schemaVersion': 1}
    provenance = {}
    for name, offset, size, expected in TABLES:
        data = image.read_object(3, offset, size)
        actual = hashlib.sha256(data).hexdigest()
        if actual != expected:
            raise ValueError('Zone-rule table hash mismatch: '+name)
        if name == 'speciesComponents':
            result[name] = [list(data[i:i+2]) for i in range(0, size, 2)]
            if any(value > 4 for pair in result[name] for value in pair):
                raise ValueError('Unsupported creature gene category')
        elif name == 'terrainLightVector':
            result[name] = list(struct.unpack('<3i', data))
        else:
            result[name] = list(data)
        provenance[name] = {'object': 3, 'offset': offset, 'bytes': size, 'sha256': actual}
    result['provenance'] = {'executableSha256': digest, 'originalExecution': False, 'tables': provenance}
    return result
