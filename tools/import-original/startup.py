"""Source-only CONQ campaign startup data; no runtime initialization is implied.

Offsets are independently expressed from the preserved mission-load,
mission-bootstrap-context, bootstrap-details and blueprint-init contracts.
All byte buffers returned here are private original content. They belong only
in the ignored local pack, never public fixtures or committed generated JSON.
Numeric pool families are zero-based, as in the source-reader contract.
"""
import base64
import hashlib
import struct


SCHEMA_VERSION = 1
LAYOUT_VERSION = 'cd-conq-fast-0x55336-v1'
CONQ_BYTES = 343958
HEADER_BYTES = 699
MAP_OFFSET = 0x355E
MAP_BYTES = 128 * 128 * 14
TAIL_OFFSET = 0x52466
EXTENSION_TAG_OFFSET = 0x5249E
EXTENSION_OFFSET = 0x524A2
PLAYER_OFFSET = 0x14
PLAYER_BYTES = 0x70D
POOL_LAYOUTS = (
    (0, 243038, 300, 116, 124),
    (1, 277838, 512, 41, 49),
    (2, 298830, 20, 140, 200),
    (3, 301630, 256, 59, 67),
    (4, 316734, 200, 73, 81),
    (5, 331334, 32, 41, 49),
    (6, 332646, 32, 89, 97),
    (7, 335494, 16, 94, 102),
)


def _b64(data):
    return base64.b64encode(data).decode('ascii')


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _u16(data, offset):
    return struct.unpack_from('<H', data, offset)[0]


def _i16(data, offset):
    return struct.unpack_from('<h', data, offset)[0]


def _u32(data, offset):
    return struct.unpack_from('<I', data, offset)[0]


def _i8(value):
    return value - 256 if value > 127 else value


def decode_map_cell(record):
    """Interpret only established fields in one 14-byte serialized map cell.

    The lighting operand is not a display shade; water physics uses doubled
    heights. The two link fields remain source references, not live pointers.
    """
    if len(record) != 14:
        raise ValueError('map cell must contain exactly 14 bytes')
    return {
        'lightOperand': _i16(record, 0), 'height': _i16(record, 2),
        'texture': record[4], 'materialAndOrientation': record[5],
        'material': record[5] & 7, 'orientation': record[5] & 0x70,
        'headIndex': _i16(record, 6), 'headKind': record[8],
        'climateOffset': _i16(record, 9), 'jobFlags': record[11],
        'revealFactor': record[12], 'rawByte13': record[13],
    }


def _active_record(record, family, index, offset):
    # All eight readers copy the same 31-byte header. Payload bytes shift by
    # eight in native memory, around resource/vtable pointers not in the file.
    result = {
        'index': index, 'sourceOffset': offset, 'type': record[6],
        'position': list(struct.unpack_from('<hh', record, 7)),
        'destination': list(struct.unpack_from('<hh', record, 11)),
        'sourceId': _i16(record, 15),
        'height': struct.unpack_from('<i', record, 17)[0],
        'flags': _u16(record, 0x15), 'shade': record[0x17],
        'owner': record[0x18], 'animation': record[0x19],
        'animationSubframe': record[0x1A], 'frame': record[0x1B],
        'animationState': record[0x1C], 'animationDelay': _u16(record, 0x1D),
        'previousLink': {'index': _i16(record, 0), 'kind': record[2]},
        'nextLink': {'index': _i16(record, 3), 'kind': record[5]},
    }
    if family == 0:
        result['resourceSelector'] = _i8(record[0x72])  # native+0x7A
        result['behaviorState'] = record[0x56]  # native+0x5E
    elif family == 1:
        result['resourceSelector'] = _i8(record[0x23])  # native+0x2B
        result['plantFlags'] = record[0x26]  # native+0x2E
    elif family == 2:
        result['commandState'] = _i8(record[0x4D])  # native+0x55
        result['readyFlags'] = _u16(record, 0x68)  # native+0x70
        result['blueprintIndex'] = record[0x6C]  # native+0x74
    elif family == 3:
        result['resourceSelector'] = record[0x25]  # native+0x2D
        result['constructionPhase'] = record[0x26]  # native+0x2E
    elif family == 4:
        result['effectCode'] = record[0x3D]  # native+0x45; 49E90 dispatch
    # Other families retain their complete payload without guessed labels.
    return result


def _player(record, slot):
    blueprints = []
    for index in range(32):
        entry = record[0x16 + index * 36:0x16 + (index + 1) * 36]
        if not entry[0]:
            continue
        blueprints.append({
            'index': index, 'name': entry[:20].split(b'\0', 1)[0].decode('cp437'),
            'style': _i8(entry[0x15]), 'category': _i8(entry[0x16]),
            'stat17': entry[0x17], 'opaque18': entry[0x18],
            'stat19': entry[0x19], 'stat1a': entry[0x1A],
            'opaque1b': entry[0x1B], 'flags20': entry[0x20],
        })
    return {
        'slot': slot, 'sourceOffset': PLAYER_OFFSET + slot * PLAYER_BYTES,
        'recordBase64': _b64(record), 'recordSha256': _sha(record),
        'state': record[0], 'playerId': record[1], 'creationMode': record[2],
        'actorCount': _i8(record[3]), 'actorIds': list(record[4:9]),
        'target': list(struct.unpack_from('<hh', record, 9)),
        'metadataCount': record[0x15], 'blueprints': blueprints,
        'funds': _u32(record, 0x4A3), 'separateBalance': _u32(record, 0x4A7),
        'progress': _i8(record[0x6E7]),
        'unknown': ['Serialized player is overlaid by retained campaign state before startup'],
    }


def validate_blueprint_names(names):
    """Validate the separately imported first 128 TEXT entries, excluding NULs.

    Accept bytes to preserve the source encoding; callers decoding CP437 can
    encode it back before validation. No original strings are supplied here.
    """
    if len(names) != 128:
        raise ValueError('blueprint names require exactly 128 entries')
    seen = set()
    result = []
    for index, name in enumerate(names):
        if not isinstance(name, bytes) or not 1 <= len(name) <= 19 or b'\0' in name:
            raise ValueError(f'invalid blueprint name at index {index}')
        if name in seen:
            raise ValueError(f'duplicate blueprint name at index {index}')
        seen.add(name)
        result.append(name.decode('cp437'))
    return result


def specialist_input_contract():
    """Required normalized inputs, not a fabricated specialist start state."""
    return {
        'names': {'textIndices': [0, 128], 'stylePools': 4, 'namesPerPool': 32,
                  'maximumNameBytes': 19},
        'blueprints': {'playerOffset': 0x16, 'count': 32, 'stride': 36,
                       'generatedCount': 20, 'categoryOrder': [0, 1, 2, 3],
                       'generatedPerCategory': 5, 'draws': 64,
                       'opaqueScratchOffsets': [0x18, 0x1B]},
        'rng': {'seedFileOffset': 0x52480, 'drawCountFileOffset': 0x52478,
                'ring': None, 'ringRequiredSeparately': True,
                'multiplier': 0xE62D, 'modulus': 65536,
                'result': 'high byte of updated 16-bit seed'},
        'resourceKey': '4 * style + category; both in 0..3',
        'resourceDescriptorTableAddress': 0x104074,
        'resourceDescriptorStride': 44, 'resourceDescriptorCount': 16,
        'retainedPlayerRanges': [[0, 0x4A1], [0x61A, 0x6F7]],
        'actorPriors': {'slotsPerPlayer': 5, 'nativeStride': 200,
                        'requireInactiveTypeByte6': True},
        'regenerationGate': 'creationMode==0 and (not campaign or progress==0 or metadataCount==0)',
        'categoryProgressGates': {'1': 1, '3': 4},
        'additionalInputs': ['selected player and retained campaign record',
                             'explicit blueprint scratch and RNG ring',
                             'native pool priors or a proved normalized replacement policy',
                             'temporary actor origin and terrain height/shade samples',
                             'landing, reveal, shade refresh and startup context integration'],
    }


def blueprint_rules():
    """Numeric 7FAD0 profile from the independently verified blueprint contract."""
    return {
        'skillBase': 25, 'skillRange': 10, 'skillDifficultyIncrement': 10,
        'healthDifficultyIncrement': 5,
        'styles': [
            {'healthBase': base, 'healthRange': span, 'healthLimit': health, 'skillLimit': skill}
            for base, span, health, skill in zip(
                [15, 40, 10, 30], [25, 10, 15, 20], [70, 100, 65, 90], [100, 75, 75, 75])
        ],
    }


def parse_startup(data, header, number=None):
    """Normalize the admitted serialized CONQ/HDR layout into a JSON-safe dict.

    Full packed pools, map cells and opaque ranges are preserved for private
    initialization. Nonzero +6 records are source-active, not ready actors.
    Bounds/tags admit the layout only; the existing importer must still apply
    its executable/source variant and input-hash admission.
    """
    if number is not None and (type(number) is not int or not 1 <= number <= 24):
        raise ValueError('campaign mission number must be 1..24')
    if len(data) != CONQ_BYTES or _u32(data, 0) != 0x55336:
        raise ValueError('unsupported CONQ startup source variant')
    if _u32(data, EXTENSION_TAG_OFFSET) != 0x6BE:
        raise ValueError('unsupported CONQ startup extension tag')
    if len(header) != HEADER_BYTES or b'\0' not in header[32:]:
        raise ValueError('unsupported campaign startup header')
    active_count = data[0x52482]
    if active_count > 4:
        raise ValueError('unsupported active player count above four')
    pools = []
    expected_offset = MAP_OFFSET + MAP_BYTES
    for family, offset, count, stride, native_stride in POOL_LAYOUTS:
        end = offset + count * stride
        if offset != expected_offset or end > TAIL_OFFSET:
            raise ValueError('invalid startup pool extent')
        packed = data[offset:end]
        active = []
        for index in range(count):
            record = packed[index * stride:(index + 1) * stride]
            if record[6]:
                active.append(_active_record(record, family, index, offset + index * stride))
        pools.append({
            'family': family, 'sourceOffset': offset, 'capacity': count,
            'packedStride': stride, 'nativeStride': native_stride,
            'packedBase64': _b64(packed), 'packedSha256': _sha(packed),
            'activeCount': len(active), 'activeRecords': active,
            'nativeCopyRanges': [[0, 31, 0], [31, stride, 39]],
            'unknown': ['Native pointer gap and runtime-only fields are not serialized',
                        'Active initializer and callback lifecycle are not executed'],
        })
        expected_offset = end
    if expected_offset != TAIL_OFFSET:
        raise ValueError('startup pools do not reach the serialized globals')
    targets = [list(struct.unpack_from('<hh', data, 0x1C7E + 4 * slot)) for slot in range(4)]
    selector = data[0x1C5B]
    terrain_unknown = [] if selector < 4 else ['Terrain atlas selector has no admitted B32A-D resource']
    zone_count = data[0x34B8]
    zones = []
    if zone_count <= 4:
        for index in range(zone_count):
            offset = 0x2FF8 + index * 19
            zones.append({
                'index': index, 'sourceOffset': offset,
                'center': list(struct.unpack_from('<hh', data, offset)),
                'selector': data[offset + 4], 'rawByte5': data[offset + 5],
                'radius': struct.unpack_from('<i', data, offset + 6)[0],
                'initialQuota': struct.unpack_from('<i', data, offset + 10)[0],
                'remainingQuota': struct.unpack_from('<i', data, offset + 14)[0],
                'rawByte18': data[offset + 18],
            })
    else:
        terrain_unknown.append('Terrain zone count exceeds the bounded four-zone initializer')
    return {
        'schemaVersion': SCHEMA_VERSION, 'layoutVersion': LAYOUT_VERSION,
        'missionNumber': number,
        'runtimeStatus': 'source-only', 'canonicalStartupComplete': False,
        'sourceSha256': _sha(data), 'headerSha256': _sha(header),
        'title': header[32:].split(b'\0', 1)[0].decode('cp437'),
        'headerBase64': _b64(header),
        'missionPrefixBase64': _b64(data[:MAP_OFFSET]),
        'players': [_player(data[PLAYER_OFFSET + i * PLAYER_BYTES:PLAYER_OFFSET + (i + 1) * PLAYER_BYTES], i)
                    for i in range(4)],
        'targets': targets,
        'context': {
            'flags': data[TAIL_OFFSET], 'frameCounter': _u32(data, 0x52474),
            'rngDrawCount': _u32(data, 0x52478), 'frameBackup': _u32(data, 0x5247C),
            'rngSeed': _u16(data, 0x52480), 'rngRing': None,
            'activePlayerCount': active_count,
            'serializedCountdown': _u16(data, 0x355C),
            'campaignEntryCountdown': 1000,
            'actorMask': data[0x1EBD], 'specialActivation': _u32(data, 0x1EC2),
            'missionFundUnits': data[0x1C5C],
            'campaignFundsBeforeEngineerCosts': data[0x1C5C] * 100,
            'globalsBase64': _b64(data[TAIL_OFFSET:TAIL_OFFSET + 52]),
            'viewportSnapshotBase64': _b64(data[0x5249A:0x5249E]),
            'unknown': ['RNG ring, selected player and runtime mode are inherited outside serialized globals',
                        'Serialized RNG is before blueprint/landing draws; not a ready-world seed'],
        },
        'terrain': {
            'atlasSelector': selector, 'atlasResource': 'B32' + 'ABCD'[selector] if selector < 4 else None,
            'atlasSelectorFileOffset': 0x1C5B,
            'mapCells14': _b64(data[MAP_OFFSET:MAP_OFFSET + MAP_BYTES]),
            'mapCellsSha256': _sha(data[MAP_OFFSET:MAP_OFFSET + MAP_BYTES]),
            'mapOffset': MAP_OFFSET, 'width': 128, 'height': 128, 'cellStride': 14,
            'cellLayout': {'lightOperandI16': 0, 'heightI16': 2, 'textureU8': 4,
                           'materialAndOrientationU8': 5, 'headIndexI16': 6, 'headKindU8': 8,
                           'climateOffsetI16': 9, 'jobFlagsU8': 11, 'revealFactorU8': 12,
                           'rawByte13U8': 13},
            'rawWaterHeight': _i16(data, 0x1C63),
            'serializedPhysicalWaterHeight': struct.unpack_from('<i', data, 0x1C67)[0],
            'loadedPhysicalWaterHeight': 2 * _i16(data, 0x1C63),
            'climate': _i16(data, 0x1C61), 'solarGeneration': _i16(data, 0x1C5F),
            'climateCenter': list(struct.unpack_from('<hh', data, 0x1EA2)),
            'zoneCount': zone_count, 'zones': zones, 'unknown': terrain_unknown,
        },
        'pools': pools, 'specialistInputs': specialist_input_contract(),
        'blueprintRules': blueprint_rules(),
        'extensionBase64': _b64(data[EXTENSION_OFFSET:]),
        'unknown': ['Source records require family initialization, bindings, links and complete lifecycles',
                    'Retained campaign/player preparation, landing and reveal remain runtime work',
                    'Header fields outside the title and extension payload remain opaque'],
    }
