"""Hash-admitted plant rules/resources and spread vectors; no code execution."""
import struct
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha
from economy_profile import read_animation_holds


RANGES = (
    ('plants', 0x4B80, 384, '297a1da0e9c30d6d4cb7c88addb8234be260e0e93b7d4b2b1c4c3ad8b7df2b7c'),
    ('spreadDirections', 0x4564, 36, '8aa88c050cdb4229467f43347efcd9a8d88e5651cf2684e92666dcfe886515b6'),
    ('plantResources', 0x3B78, 528, '86eef7810196a55ee8b601a908a4c94ab1dd91493590ea4264e9e96b03e2403e'),
    ('corpseFriction', 0x4520, 16, 'd56e59eae4da3dcb6d5cd9451d25e0ca49259a3a3004f43a40b47c40ae63a707'),
    ('speciesTraits', 0x45FC, 1125, '9cb13776195def5c4c875533fac9615356ffb8a65d4b059637f56c7e290a1707'),
    ('attackChannels', 0x60A0, 5, '5a5eaa0c7ccc5f4ffca0fd4f06c1847eead18eb5321dd301bb618ee4d720a96e'),
)


def import_mule_animations(decoded_mule):
    """Admit the separate animation metadata required by the live callback."""
    if (not isinstance(decoded_mule, (bytes, bytearray, memoryview))
            or len(decoded_mule) != 57038
            or sha(decoded_mule) != 'f6c62221b52a62088f91ae8d00becfef513282cbf98a5990c1a0859cd8b2d346'):
        raise ValueError('unrecognized decoded MULE animation resource')
    if struct.unpack_from('<H', decoded_mule)[0] != 24:
        raise ValueError('MULE requires 24 animation records')
    result = []
    for action in range(24):
        profile = read_animation_holds(decoded_mule, action)
        if profile['flags'] & ~1 or len(profile['holds']) == 1 and profile['flags'] & 1:
            raise ValueError('unsupported MULE animation playback flags')
        result.append({'holds': profile['holds'], 'flags': profile['flags'],
                       'first': profile['firstFrameOffset'] // 14,
                       'last': profile['lastFrameOffset'] // 14})
    return result


def import_ecology_rules(executable_bytes):
    """Return normalized private JSON tables after executable/range admission."""
    if not isinstance(executable_bytes, (bytes, bytearray, memoryview)):
        raise ValueError('ecology input must be executable bytes')
    if len(executable_bytes) > MAX_FILE_BYTES or sha(executable_bytes) != EXECUTABLE_SHA256:
        raise ValueError('unrecognized ecology executable variant')
    image = LEImage(executable_bytes)
    result = {'schemaVersion': 1, 'plants': [], 'spreadDirections': [], 'plantResources': [],
              'mule': {'selector': 4, 'baseSpeed': 704, 'lifetimeScale': 19000,
                       'reserveScale': 160, 'healthScale': 80,
                       'healthRecoveryPeriod': 20, 'warmThreshold': 25},
              'provenance': {'executableSha256': EXECUTABLE_SHA256, 'originalExecution': False,
                             'ranges': {}, 'muleEquations': 'preserved mule-skill-parameterization / 5A990,5E0B0,6A290'}}
    for name, offset, size, expected in RANGES:
        raw = image.read_object(3, offset, size)
        if sha(raw) != expected:
            raise ValueError('ecology table hash mismatch: ' + name)
        result['provenance']['ranges'][name] = {'object': 3, 'objectOffset': offset,
            'virtualAddress': 0x100000 + offset, 'bytes': size, 'sha256': expected,
            'method': 'LE initialized data; no execution or relocations'}
        if name == 'plants':
            for slot in range(12):
                row = raw[slot * 32:(slot + 1) * 32]
                result['plants'].append({'selector': slot, 'growthDeltas': list(struct.unpack_from('<8b', row, 16)),
                    'spreadPeriod': row[24], 'walkSteps': row[25], 'crowdingLimit': row[26],
                    'checkThreshold': row[27], 'nutrition': row[28], 'retirementDelay': row[29],
                    'opaqueBytes': list(row[:16] + row[30:32]), 'rowSha256': sha(row)})
        elif name == 'spreadDirections':
            result[name] = [list(struct.unpack_from('<hh', raw, i * 4)) for i in range(9)]
        elif name == 'corpseFriction':
            result[name] = list(struct.unpack('<8h', raw))
        elif name == 'speciesTraits':
            result[name] = [list(raw[i*45:(i+1)*45]) for i in range(25)]
            row = raw[4*45:5*45]
            result['muleCombat'] = {'queryRadius': struct.unpack_from('<i',row)[0],
                'attack': row[4], 'defense': row[5], 'disposition': row[0x24],
                'foodWeights': list(row[0x1D:0x20])}
            for key, offset in (('baseSpeed',6),('lifetimeScale',10),('healthScale',14),('reserveScale',18),('healthRecoveryPeriod',22)):
                result['mule'][key] = struct.unpack_from('<i',row,offset)[0]
        elif name == 'attackChannels':
            result[name] = list(struct.unpack('<5b',raw))
            result['muleCombat']['attackChannel'] = result[name][4]
        else:
            for slot in range(12):
                descriptor = raw[slot * 44:(slot + 1) * 44]
                terminator = descriptor.find(b'\0', 0, 28)
                if terminator < 1 or any(descriptor[terminator:28]):
                    raise ValueError('invalid plant resource descriptor name')
                try:
                    path = descriptor[:terminator].decode('ascii')
                except UnicodeDecodeError as error:
                    raise ValueError('non-ASCII plant resource name') from error
                if (not path.startswith('data/plant/') or not path.endswith('.anb')
                        or '..' in path or '\\' in path or ':' in path):
                    raise ValueError('unsafe plant resource descriptor')
                if struct.unpack_from('<I', descriptor, 28)[0] != 0x16894 + slot * 4:
                    raise ValueError('plant resource slot mismatch')
                result[name].append({'selector': slot, 'path': path,
                                     'assetKey': path.rsplit('/', 1)[-1][:-4].upper()})
    return result
