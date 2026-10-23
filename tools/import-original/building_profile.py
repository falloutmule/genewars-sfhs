"""Admit building resource bindings and callback numeric inputs, without execution."""
import struct
from pathlib import PurePosixPath
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

DESCRIPTORS_SHA256 = '5ed6c6a837f5e0ed5681490ef3482985be324d1a9fc151288cfcaad85cdcff71'
UPKEEP_SHA256 = 'a7d0a5cdef73f2a5672793fb185fd748ee4f2ab7f26dcdf39435287dbbffad23'
FRONT_SHA256 = 'e890f350f4385cfe5b486628906ccb2370663d40763f50d39c272d49b3d583a6'

def import_building_rules(executable_bytes):
    if not isinstance(executable_bytes, (bytes, bytearray, memoryview)):
        raise ValueError('building input must be executable bytes')
    if len(executable_bytes) > MAX_FILE_BYTES or sha(executable_bytes) != EXECUTABLE_SHA256:
        raise ValueError('unrecognized building executable variant')
    image = LEImage(executable_bytes)
    spans = ((0x393C, 572, DESCRIPTORS_SHA256), (0x4D10, 14, UPKEEP_SHA256),
             (0x457C, 4, FRONT_SHA256))
    data = []
    for offset, count, expected in spans:
        raw = image.read_object(3, offset, count)
        if len(raw) != count or sha(raw) != expected:
            raise ValueError('building numeric/resource span hash mismatch')
        data.append(raw)
    resources = []
    for index in range(13):
        row = data[0][index*44:(index+1)*44]
        # Stored pointer is object-relative before the LE relocation is applied.
        destination = struct.unpack_from('<I', row, 28)[0]
        delta = destination - 0x16824
        if delta % 4 or not 0 <= delta//4 < 14:
            raise ValueError('invalid building resource destination')
        path_bytes = row[:28].split(b'\0', 1)[0]
        try:
            path = path_bytes.decode('ascii').replace('\\', '/')
        except UnicodeDecodeError as error:
            raise ValueError('invalid building resource path') from error
        parsed = PurePosixPath(path)
        if parsed.is_absolute() or '..' in parsed.parts or ':' in path or parsed.suffix.upper() != '.ANB':
            raise ValueError('unsafe building resource path')
        resources.append({'selector': delta//4, 'path': path, 'assetKey': parsed.stem.upper()})
    resources.sort(key=lambda row: row['selector'])
    if len({row['selector'] for row in resources}) != 13:
        raise ValueError('duplicate building resource selector')
    return {'schemaVersion': 1, 'resources': resources,
            'unsupportedSelectors': [index for index in range(14) if index not in {row['selector'] for row in resources}],
            'upkeep': list(data[1]), 'processingFrontOffset': list(struct.unpack('<hh', data[2])),
            'provenance': {'executableSha256': EXECUTABLE_SHA256, 'originalExecution': False,
                           'spans': [{'object': 3, 'objectOffset': offset, 'bytes': count, 'sha256': expected}
                                     for offset, count, expected in spans]}}
