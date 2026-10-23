"""Read original SOUND.DAT bank descriptors; never guess RIFF ordinal cues.

Original samples/profile output belong only in the ignored private pack. This
module contains no waveform data, original sample-name table or instructions.
"""
import hashlib
import struct

SOURCE_VERSION = 'qa-beta-v5-cd'
EXECUTABLE_SHA256 = '4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba'
SOUND_DAT_SHA256 = '6cdf9b501ddf888f7beb43062876515a26d1d87fc3a776db9fb000a33d7d7388'
SOUND_DAT_BYTES = 12282542
MAX_BYTES = 64 * 1024 * 1024
FORMAT_COUNT = 9
BANK_ROW_BYTES = FORMAT_COUNT * 16
DESCRIPTOR_BYTES = 32
GAMEPLAY_BANK = 0
ADMITTED_FORMATS = (2, 6)
MISSING = 0xffffffff

# Independently named simulation ports, not original resource table contents.
# Producer61/35 in the Rust evidence are DECIMAL names: native3D/23.
CUE_PORTS = (
    ('landing.descent', 0x50), ('landing.contact', 0x51), ('landing.departure', 0x52),
    ('engineer.terraform', 0x29), ('engineer.hammer', 0x4a), ('engineer.work', 0x60),
    ('distributor.pulse', 61), ('photon.pulse', 35),
    ('extractor.work', 0x2f), ('extractor.finish', 0x30),
    ('extractor.harvest', 0x32), ('extractor.empty', 0x4e),
)


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _range(offset, size, bound, name):
    if not 0 <= offset <= bound or not 0 <= size <= bound - offset:
        raise ValueError('out-of-bounds ' + name)


def _wave(raw, offset, stored_bytes):
    _range(offset, stored_bytes, len(raw), 'stored WAVE')
    if stored_bytes < 12 or raw[offset:offset + 4] != b'RIFF' or raw[offset + 8:offset + 12] != b'WAVE':
        raise ValueError('sample descriptor does not point to RIFF WAVE')
    length = struct.unpack_from('<I', raw, offset + 4)[0] + 8
    _range(0, length, stored_bytes, 'RIFF declared length')
    cursor, pcm, data_bytes = 12, None, None
    while cursor < length:
        if cursor + 8 > length:
            raise ValueError('truncated WAVE chunk header')
        kind = raw[offset + cursor:offset + cursor + 4]
        size = struct.unpack_from('<I', raw, offset + cursor + 4)[0]
        _range(cursor + 8, size, length, 'WAVE chunk')
        if kind == b'fmt ':
            if size < 16 or pcm is not None:
                raise ValueError('invalid WAVE fmt chunk')
            tag, channels, rate, byte_rate, align, bits = struct.unpack_from('<HHIIHH', raw, offset + cursor + 8)
            if tag != 1 or channels < 1 or rate < 1 or bits not in (8, 16) or align != channels * bits // 8 or byte_rate != rate * align:
                raise ValueError('unsupported PCM WAVE format')
            pcm = {'formatTag': tag, 'channels': channels, 'sampleRate': rate, 'bitsPerSample': bits,
                   'byteRate': byte_rate, 'blockAlign': align}
        if kind == b'data':
            if data_bytes is not None:
                raise ValueError('duplicate WAVE data chunk')
            data_bytes = size
        cursor += 8 + size + (size & 1)
    if pcm is None or data_bytes is None or cursor != length:
        raise ValueError('incomplete WAVE chunks')
    return {'offset': offset, 'bytes': length, 'storedBytes': stored_bytes,
            'sha256': _sha(raw[offset:offset + length]), 'pcm': pcm, 'dataBytes': data_bytes}


def parse_sound_container(sound_dat):
    """Bounded generic reader for the source A1EC0/A21D0 container shape.

    The final dword locates nine bank-count words, bank*144 format rows,
    then72 allocation-size bytes and the final dword. A format row is
    table-offset,data-offset,table-bytes,data-bytes. Table0 is reserved;
    cue1..N indexes32-byte descriptors; byte18 holds its relative data offset
    and byte26 the padded storage extent. RIFF's own length selects output.
    """
    if not isinstance(sound_dat, (bytes, bytearray, memoryview)):
        raise ValueError('SOUND.DAT must be bytes')
    raw = bytes(sound_dat)
    if not 94 <= len(raw) <= MAX_BYTES:
        raise ValueError('SOUND.DAT size outside bound')
    metadata = struct.unpack_from('<I', raw, len(raw) - 4)[0]
    _range(metadata, 18, len(raw) - 4, 'sound bank counts')
    counts = struct.unpack_from('<9H', raw, metadata)
    bank_count = max(counts)
    if not 1 <= bank_count <= 256 or metadata + 18 + bank_count * BANK_ROW_BYTES + 72 + 4 != len(raw):
        raise ValueError('invalid sound bank footer extent')
    banks = []
    for bank in range(bank_count):
        formats = []
        for format_index in range(FORMAT_COUNT):
            at = metadata + 18 + bank * BANK_ROW_BYTES + format_index * 16
            table, data, table_bytes, data_bytes = struct.unpack_from('<4I', raw, at)
            fields = (table, data, table_bytes, data_bytes)
            if fields == (MISSING,) * 4:
                if bank < counts[format_index]:
                    raise ValueError('declared sound bank format is missing')
                continue
            if MISSING in fields or bank >= counts[format_index]:
                raise ValueError('inconsistent sound bank format count')
            if table_bytes < DESCRIPTOR_BYTES or table_bytes % DESCRIPTOR_BYTES:
                raise ValueError('invalid sound descriptor table length')
            _range(table, table_bytes, metadata, 'sound descriptor table')
            _range(data, data_bytes, metadata, 'sound data region')
            if raw[table:table + 3] == b'RNC' or raw[data:data + 3] == b'RNC':
                raise ValueError('compressed sound bank variant requires an explicit decoder')
            if not (table + table_bytes <= data or data + data_bytes <= table):
                raise ValueError('overlapping sound table/data regions')
            records = []
            for cue in range(1, table_bytes // DESCRIPTOR_BYTES):
                descriptor = table + cue * DESCRIPTOR_BYTES
                name_bytes = raw[descriptor:descriptor + 18]
                terminator = name_bytes.find(b'\0')
                if terminator < 1:
                    raise ValueError('unterminated or empty sound sample name')
                try:
                    name = name_bytes[:terminator].decode('ascii')
                except UnicodeDecodeError as error:
                    raise ValueError('non-ASCII sound sample name') from error
                if '/' in name or '\\' in name or '..' in name:
                    raise ValueError('unsafe sound sample basename')
                relative = struct.unpack_from('<I', raw, descriptor + 18)[0]
                stored = struct.unpack_from('<I', raw, descriptor + 26)[0]
                _range(relative, stored, data_bytes, 'descriptor sample range')
                wave = _wave(raw, data + relative, stored)
                records.append({'cue': cue, 'descriptorOffset': descriptor, 'name': name,
                                'relativeOffset': relative, 'playable': name.casefold() != 'null.wav', **wave})
            formats.append({'formatIndex': format_index, 'tableOffset': table, 'dataOffset': data,
                            'tableBytes': table_bytes, 'dataBytes': data_bytes, 'records': records})
        banks.append({'bank': bank, 'formats': formats})
    return {'metadataOffset': metadata, 'formatBankCounts': list(counts), 'banks': banks}


def import_audio_profile(sound_dat, *, executable_sha256, source_version):
    """Return deterministic private cue/sample JSON for the verified CD.

    Caller validates executable bytes and supplies their actual identity.
    SOUND.DAT identity is independently validated here before parsing.
    """
    if executable_sha256 != EXECUTABLE_SHA256 or source_version != SOURCE_VERSION:
        raise ValueError('unsupported audio source version/executable identity')
    if not isinstance(sound_dat, (bytes, bytearray, memoryview)):
        raise ValueError('SOUND.DAT must be bytes')
    raw = bytes(sound_dat)
    if len(raw) != SOUND_DAT_BYTES or _sha(raw) != SOUND_DAT_SHA256:
        raise ValueError('unsupported SOUND.DAT identity')
    container = parse_sound_container(raw)
    bank = container['banks'][GAMEPLAY_BANK]
    formats = {item['formatIndex']: item for item in bank['formats']}
    records = []
    for index in ADMITTED_FORMATS:
        if index not in formats or len(formats[index]['records']) != 98:
            raise ValueError('unsupported gameplay sound bank descriptor count')
        for record in formats[index]['records']:
            pcm = record['pcm']
            # Format6's source bank mixes8/16-bit samples, including requested
            # departure82. The RIFF header, not the bank-format number, owns
            # each sample's PCM width.
            if (pcm['channels'], pcm['sampleRate']) != (1, 22050) or (index == 2 and pcm['bitsPerSample'] != 16):
                raise ValueError('unsupported gameplay sound bank PCM format')
            records.append({'key': f'SOUND:{GAMEPLAY_BANK}:{index}:{record["cue"]}',
                            'bank': GAMEPLAY_BANK, 'formatIndex': index, **record})
    cues = {}
    for name, cue in CUE_PORTS:
        sample = next(record for record in records if record['formatIndex'] == 2 and record['cue'] == cue)
        alternate = next(record for record in records if record['formatIndex'] == 6 and record['cue'] == cue)
        if not sample['playable'] or not alternate['playable']:
            raise ValueError('required audio cue is a null placeholder')
        if sample['name'].casefold() != alternate['name'].casefold():
            raise ValueError('required audio cue differs between source formats')
        cues[name] = {'cue': cue, 'hex': f'0x{cue:02X}', 'bank': GAMEPLAY_BANK,
                     'descriptorIndex': cue, 'soundKey': sample['key'],
                     'alternateSoundKey': f'SOUND:{GAMEPLAY_BANK}:6:{cue}',
                     'sampleName': sample['name'], 'textIndex': None,
                     'subtitleStatus': 'No TEXT lookup established for the generic effect-cue path; do not substitute a speech ordinal.'}
    return {
        'schemaVersion': 1, 'sourceVersion': SOURCE_VERSION,
        'preferredFormatIndex': 2, 'alternateFormatIndex': 6,
        'cues': cues, 'records': records,
        'speechBoundary': {'effectCueSentinel': 99, 'handler': 'source40360',
                           'status': 'Separate actor/narration speech routing; these effect cues do not imply SPE record or subtitle indices.'},
        'provenance': {
            'executableSha256': executable_sha256, 'soundDatSha256': _sha(raw), 'soundDatBytes': len(raw),
            'metadataOffset': container['metadataOffset'], 'formatBankCounts': container['formatBankCounts'],
            'mapping': 'Source gameplay7D780 loads bank0; entity1E810/417E0 preserves cue byte;41573 forwards it toA2690, which indexes cue*32;A2170 relocates descriptor+18.',
            'reader': 'SourceA1EC0/A21D0 reads final-dword metadata pointer, nine counts and144-byte bank rows. Sample extent uses descriptor+26 for bounds and RIFF size for exact bytes.',
            'sourceInstructionRanges': [
                {'range': '7D76A..7D785', 'sha256': '053b207059e0af9987ede49fa6241b91f6ff2de26d8b67f7f338f87197320a3a'},
                {'range': '1E810..1E83A', 'sha256': '3380b8a0a61daaff83ba6fe629a6b866b0b50d5d5a5ae2d9603d60275b2070b8'},
                {'range': '41550..4157A', 'sha256': 'a9fdb10373f69e3001a914481085195543fa4b476e3e453efac6f51f0340d720'},
                {'range': 'A2690..A2707', 'sha256': 'b8790cdfe4d5e91f64a2af9e6841225612b385e40233f420558c9aebf811fb43'},
                {'range': 'A2170..A21C7', 'sha256': '1caab960f42953560347cbc782711143ddd5ed5ceb44c47edefd09800924d751'},
                {'range': 'A21D0..A23C7', 'sha256': 'e05354f15fd3ae1283fe721fd1ad360267d77fab7860ecf221af8ed62876cbee'},
            ],
            'originalExecution': False,
            'limits': ['Waveforms are extracted from original descriptor offsets, not a search for RIFF signatures.',
                       'Profiles/samples remain private original content; playback, source voice scheduling and subtitles are host work.',
                       'Preferred format2 is a conversion playback choice; original device/format selection is not reproduced. Format6 contains mixed8/16-bit WAVE headers.',
                       'Producer61/35 semantic names are decimal native3D/23, not hexadecimal61/35.',
                       'Other banks/sample-rate variants and speech-sentinel routing are not mapped to these simulation ports.'],
        },
    }


def extract_audio_waves(sound_dat, profile):
    """Return key→exact RIFF bytes for the already admitted private profile."""
    raw = bytes(sound_dat)
    if _sha(raw) != profile['provenance']['soundDatSha256'] or _sha(raw) != SOUND_DAT_SHA256:
        raise ValueError('audio profile/source identity mismatch')
    waves = {}
    for record in profile['records']:
        _range(record['offset'], record['bytes'], len(raw), 'profile sample range')
        wave = raw[record['offset']:record['offset'] + record['bytes']]
        if _sha(wave) != record['sha256'] or record['key'] in waves:
            raise ValueError('audio sample hash/key mismatch')
        waves[record['key']] = wave
    return waves
