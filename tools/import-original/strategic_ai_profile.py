"""Hash-admitted numeric AI metadata; no code, fixups or execution."""
import struct
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

GROUP_LIMITS_OFFSET = 0x79D4
GROUP_LIMITS_BYTES = 6
GROUP_LIMITS_SHA256 = 'b2c9995a81357cf8cf6b6d59e964165b009fc3c9450769ea5ee35d1362b9c9fe'
SPECIES_GENES_SHA256 = 'a110979272cb3e9924405693ff8833fcfc715ef45e0c7d5b95e1286efcb8df94'
PRODUCTION_WEIGHTS_SHA256 = 'c9966e10c7b70cf06838f4739273597fdf3ff86d0a566167b1b3ab6077805602'
BUILDING_VALUES_SHA256 = 'ee9c21c6449a10c2e42862da10fdb291c77dde8cd779645b215aa698feee77f8'
BUILDING_THREAT_SHA256 = 'f18a2e4b69ba6c4d46cfc96eed1a3fb71bb7baa400e2fb02a88971db646aee9d'
SPECIALIST_THREAT_SHA256 = 'e7e2dfe94e08fc91e8d9b16537b550d3b5a7ed2ab0e5427280f402f3543d4471'
CREATURE_CONTROL_PRIOR_SHA256 = 'bd50e12c55dda3ee443c1cb6d71c7bcf6351c4ec96f7bc8d6adec015d1192eea'


def import_strategic_ai_rules(executable_bytes):
    if (not isinstance(executable_bytes, (bytes, bytearray, memoryview))
            or len(executable_bytes) > MAX_FILE_BYTES
            or sha(executable_bytes) != EXECUTABLE_SHA256):
        raise ValueError('unrecognized strategic AI executable variant')
    image = LEImage(executable_bytes)
    result = {'schemaVersion': 1, 'provenance': {
        'executableSha256': EXECUTABLE_SHA256, 'originalExecution': False,
        'sourceFunctions': ['3E270', '35730', '35820', '360B0', '37870']}}
    for name, offset, size, row_size, expected in (
            ('groupLimits', GROUP_LIMITS_OFFSET, GROUP_LIMITS_BYTES, 1, GROUP_LIMITS_SHA256),
            ('speciesGenes', 0x4A64, 50, 2, SPECIES_GENES_SHA256),
            ('productionWeights', 0x79F8, 125, 5, PRODUCTION_WEIGHTS_SHA256),
            ('buildingValues', 0x78F8, 84, 6, BUILDING_VALUES_SHA256),
            ('buildingThreatValues', 0x794C, 84, 6, BUILDING_THREAT_SHA256),
            ('specialistThreatWeights', 0x79D0, 4, 1, SPECIALIST_THREAT_SHA256),
            ('creatureControlPrior', 0x84D7C, 600, 1, CREATURE_CONTROL_PRIOR_SHA256)):
        raw = image.read_object(3, offset, size)
        if len(raw) != size or sha(raw) != expected:
            raise ValueError('strategic AI ' + name + ' hash/extent mismatch')
        result[name] = ([list(struct.unpack_from('<3h', raw, i)) for i in range(0, size, 6)]
                        if row_size == 6 else list(raw) if row_size == 1 else
                        [list(raw[i:i + row_size]) for i in range(0, size, row_size)])
        result['provenance'][name] = {
            'object': 3, 'objectOffset': offset, 'virtualAddress': 0x100000 + offset,
            'bytes': size, 'sha256': expected,
            'method': 'LE initialized numeric data; no fixups or execution'}
    return result
