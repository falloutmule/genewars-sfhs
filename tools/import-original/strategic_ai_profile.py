"""Hash-admitted numeric AI group limits; no code, fixups or execution."""
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

GROUP_LIMITS_OFFSET = 0x79D4
GROUP_LIMITS_BYTES = 6
GROUP_LIMITS_SHA256 = 'b2c9995a81357cf8cf6b6d59e964165b009fc3c9450769ea5ee35d1362b9c9fe'
SPECIES_GENES_SHA256 = 'a110979272cb3e9924405693ff8833fcfc715ef45e0c7d5b95e1286efcb8df94'
PRODUCTION_WEIGHTS_SHA256 = 'c9966e10c7b70cf06838f4739273597fdf3ff86d0a566167b1b3ab6077805602'


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
            ('productionWeights', 0x79F8, 125, 5, PRODUCTION_WEIGHTS_SHA256)):
        raw = image.read_object(3, offset, size)
        if len(raw) != size or sha(raw) != expected:
            raise ValueError('strategic AI ' + name + ' hash/extent mismatch')
        result[name] = (list(raw) if row_size == 1 else
                        [list(raw[i:i + row_size]) for i in range(0, size, row_size)])
        result['provenance'][name] = {
            'object': 3, 'objectOffset': offset, 'virtualAddress': 0x100000 + offset,
            'bytes': size, 'sha256': expected,
            'method': 'LE initialized numeric data; no fixups or execution'}
    return result
