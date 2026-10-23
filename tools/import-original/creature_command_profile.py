"""Admit source5C920's numeric displacement without fixups or execution."""
import struct
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

OFFSET = 0x457C
SIZE = 4
OFFSET_SHA256 = 'e890f350f4385cfe5b486628906ccb2370663d40763f50d39c272d49b3d583a6'
SEARCH_ORDER_OFFSET = 0x60B8
SEARCH_ORDER_SHA256 = 'da1bae4129eab0d03573bda893898f4085eb4d20f355bb3af1028a3a3a2494a5'
SEARCH_BASE = 0x4564
SEARCH_VALUES_SHA256 = '7f0e455a2783b373606b1b9be2c319d9f323d6a221ef4a2c29c85be321c37fb6'


def import_creature_command_rules(executable_bytes):
    if (not isinstance(executable_bytes, (bytes, bytearray, memoryview))
            or len(executable_bytes) > MAX_FILE_BYTES
            or sha(executable_bytes) != EXECUTABLE_SHA256):
        raise ValueError('unrecognized creature command executable variant')
    image = LEImage(executable_bytes)
    raw = image.read_object(3, OFFSET, SIZE)
    if len(raw) != SIZE or sha(raw) != OFFSET_SHA256:
        raise ValueError('creature command offset hash/extent mismatch')
    order = image.read_object(3, SEARCH_ORDER_OFFSET, 9)
    if len(order) != 9 or sha(order) != SEARCH_ORDER_SHA256:
        raise ValueError('creature command search order hash/extent mismatch')
    values = [image.read_object(3, SEARCH_BASE + index * 4, 4) for index in order]
    if any(len(row) != 4 for row in values) or sha(b''.join(values)) != SEARCH_VALUES_SHA256:
        raise ValueError('creature command search values hash/extent mismatch')
    return {'schemaVersion': 1, 'corpseDepositOffset': list(struct.unpack('<2h', raw)),
            'footprintSearchOffsets': [list(struct.unpack('<2h', row)) for row in values],
            'provenance': {'executableSha256': EXECUTABLE_SHA256, 'originalExecution': False,
                           'sourceFunctions': ['5C920'], 'corpseDepositOffset': {
                               'object': 3, 'objectOffset': OFFSET, 'bytes': SIZE,
                               'virtualAddress': 0x100000 + OFFSET, 'sha256': OFFSET_SHA256,
                               'method': 'LE initialized numeric data; no fixups or execution'},
                           'footprintSearchOffsets': {'object': 3, 'orderOffset': SEARCH_ORDER_OFFSET,
                                                      'orderBytes': 9, 'orderSha256': SEARCH_ORDER_SHA256,
                                                      'indexedBase': SEARCH_BASE, 'joinedBytes': 36,
                                                      'sha256': SEARCH_VALUES_SHA256,
                                                      'method': 'Nine ordered indexed numeric points; no fixups or execution'}}}
