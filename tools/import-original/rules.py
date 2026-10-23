"""Import only hash-admitted numeric rules from the private CD executable.

The LE reader maps normal data pages and zero-filled virtual tails. It neither
executes instructions nor applies relocations: the selected numeric ranges are
relocation-independent and each range must match its own published hash.
"""
import hashlib
import struct


EXECUTABLE_SHA256 = '4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba'
MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_VIRTUAL_BYTES = 64 * 1024 * 1024
TERRAIN_BORDER_SHA256 = '422f124eac806197ba95d2438516284c3bf828a1db8e8aabe330661fff23ef8a'

# name, object (one based), object offset, element format, element count, SHA256.
# No executable instructions or proprietary table contents are embedded here.
TABLES = (
    ('terrainCornerPatterns', 3, 0x5060, 'B', 640,
     'd848e423b7a76a2c2dbf517fc595e33a789df7382697b56f382cc7606b18939e'),
    ('atan', 1, 0x9E134, 'H', 257,
     '1c26f16f88a3e0cedc9c879837b3849567ff70514c033eb6249bd95a264debce'),
    ('bounce', 3, 0x4530, 'h', 8,
     'c62a747206c89218e01102645341f151f5308fe1259b177f9d0418a67575e5e5'),
    ('constructionCosts', 3, 0x4E1C, 'i', 14,
     'cfa842063144e873d53542ae67d8fd138ccd3baf55d01ab5ab3551d0c38af165'),
    ('sine', 3, 0x7EE8, 'i', 2048,
     '84dfe6902e4c8947b75f4ff0a54d82fced478dd9682255eaa973a88cbf76cf3c'),
    ('cosine', 3, 0x86E8, 'i', 2048,
     '688e629369dc1c5379bae04b5e11100a4fd0aabd89745f2c0b5b6309ce0261c9'),
    ('buildingMenuOrder', 3, 0x4D00, 'B', 14,
     '3d47535dae398c434465626452714401fcbca8576f0409c8692aef285554487f'),
    ('buildingHealth', 3, 0x4D1E, 'h', 42,
     'ad61e02f3a71ffd8a4604d38b2d2967209b456feedac52c645c54e989a29a10b'),
    ('buildingProgressThresholds', 3, 0x4D88, 'B', 42,
     'f6eabc9426aaddab4771fa55ed3addd23954384524eb6c0771f16271a0af7345'),
    ('buildingFootprints', 3, 0x4DE0, 'B', 14,
     'e692c7083a76eb15e192f34897d136461f9337e3c2e8a705f31ef7905749eee7'),
    ('buildingPrerequisites', 3, 0x4E74, 'B', 14,
     '40499f51499774b89b384ec5513df5293e2cc43307208ef22b7c0fdd138564f7'),
)

# These source ranges are normalized into selected columns / resource keys;
# the raw descriptor's relocatable pointer and unused fields are not returned.
AUXILIARY_TABLES = (
    ('actorStyleParameters', 3, 0x4AE8, 64,
     'd45d9ffa3317639760153b0f900ff2d314f937480ba54d7b3fe8d6cda6809ec9'),
    ('actorResourceDescriptors', 3, 0x4074, 704,
     'a7ec614093a65ee20865fd373e07c96342ae6273080e9b0ca00a31c4f15a24cf'),
)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def _range(offset, size, bound, label):
    if (not isinstance(offset, int) or not isinstance(size, int)
            or offset < 0 or size < 0 or offset > bound or size > bound-offset):
        raise ValueError('out-of-bounds '+label)


class LEImage:
    """Bounded little-endian LE subset used by the admitted source variant.

    Page numbers in LE's four-byte page entries have three big-endian bytes;
    the remaining byte is the page kind. Compressed, iterated, invalid and
    range pages are rejected instead of guessed. Omitted object tail pages
    and the unstored part of the final physical page are explicitly zero.
    """

    def __init__(self, executable_bytes):
        if not isinstance(executable_bytes, (bytes, bytearray, memoryview)):
            raise ValueError('LE input must be bytes')
        if not 0x40 <= len(executable_bytes) <= MAX_FILE_BYTES:
            raise ValueError('LE input size outside bound')
        self._data = bytes(executable_bytes)
        if self._data[:2] != b'MZ':
            raise ValueError('missing DOS executable header')
        self.le_offset = struct.unpack_from('<I', self._data, 0x3C)[0]
        _range(self.le_offset, 0x88, len(self._data), 'LE header')
        header = self.le_offset
        if self._data[header:header+2] != b'LE' or self._data[header+2:header+4] != b'\0\0':
            raise ValueError('unsupported LE signature or byte order')

        def word(offset):
            return struct.unpack_from('<I', self._data, header+offset)[0]

        if word(4) != 0:
            raise ValueError('unsupported LE format level')
        self.page_count, self.page_size = word(0x14), word(0x28)
        last_page_bytes = word(0x2C)
        if not 1 <= self.page_count <= 131072:
            raise ValueError('LE page count outside bound')
        if (not 512 <= self.page_size <= 65536
                or self.page_size & (self.page_size-1)):
            raise ValueError('unsupported LE page size')
        if not 1 <= last_page_bytes <= self.page_size:
            raise ValueError('invalid LE last page length')
        object_count = word(0x44)
        if not 1 <= object_count <= 4096:
            raise ValueError('LE object count outside bound')
        object_table, page_table = header+word(0x40), header+word(0x48)
        object_table_size, page_table_size = object_count*24, self.page_count*4
        for start, size, label in ((object_table, object_table_size, 'LE object table'),
                                   (page_table, page_table_size, 'LE page table')):
            _range(start, size, len(self._data), label)
            if start < header+0x88:
                raise ValueError(label+' overlaps header')
        if not (object_table+object_table_size <= page_table
                or page_table+page_table_size <= object_table):
            raise ValueError('overlapping LE metadata tables')
        self._data_base = word(0x80)  # This LE field is file-relative.
        if self._data_base < max(object_table+object_table_size, page_table+page_table_size):
            raise ValueError('LE physical pages overlap metadata')
        physical_bytes = (self.page_count-1)*self.page_size+last_page_bytes
        _range(self._data_base, physical_bytes, len(self._data), 'LE physical pages')

        self._pages = []
        for index in range(self.page_count):
            entry = self._data[page_table+index*4:page_table+(index+1)*4]
            physical = int.from_bytes(entry[:3], 'big')
            if entry[3] != 0 or not 1 <= physical <= self.page_count:
                raise ValueError('unsupported or invalid LE page entry')
            size = last_page_bytes if physical == self.page_count else self.page_size
            self._pages.append((self._data_base+(physical-1)*self.page_size, size))

        self.objects, owned, total_size = [], set(), 0
        for index in range(object_count):
            size, base, flags, first, count, reserved = struct.unpack_from(
                '<6I', self._data, object_table+index*24)
            if size > MAX_VIRTUAL_BYTES or base+size > 0x100000000 or reserved:
                raise ValueError('unsupported LE object size, base or reserved field')
            total_size += size
            if total_size > MAX_VIRTUAL_BYTES or count > (size+self.page_size-1)//self.page_size:
                raise ValueError('LE virtual objects exceed bound')
            if count:
                if not 1 <= first <= self.page_count or count > self.page_count-first+1:
                    raise ValueError('out-of-bounds LE object page range')
                indices = set(range(first-1, first-1+count))
                if owned & indices:
                    raise ValueError('overlapping LE object page ranges')
                owned.update(indices)
            elif first != 0:
                raise ValueError('empty LE object has a page index')
            self.objects.append({'number': index+1, 'size': size, 'base': base,
                                 'flags': flags, 'pageIndex': first, 'pageCount': count})
        if len(owned) != self.page_count:
            raise ValueError('unowned LE logical pages')

    def read_object(self, number, offset, length):
        """Read an object range, respecting page mapping and virtual bounds."""
        if not isinstance(number, int) or not 1 <= number <= len(self.objects):
            raise ValueError('invalid LE object number')
        obj = self.objects[number-1]
        _range(offset, length, obj['size'], 'LE object read')
        result = bytearray(length)
        cursor = 0
        while cursor < length:
            page, within = divmod(offset+cursor, self.page_size)
            amount = min(length-cursor, self.page_size-within)
            if page < obj['pageCount']:
                disk, stored = self._pages[obj['pageIndex']-1+page]
                copied = min(amount, max(0, stored-within))
                result[cursor:cursor+copied] = self._data[disk+within:disk+within+copied]
            cursor += amount
        return bytes(result)


def build_terrain_border(patterns):
    """Derive 4096 material/orientation pairs from 160 four-corner patterns."""
    if len(patterns) != 640:
        raise ValueError('terrain corner pattern length must be 640')
    table, assigned = bytearray([151, 0]*4096), bytearray(4096)
    for tile in range(160):
        a, b, c, d = (value & 7 for value in patterns[tile*4:tile*4+4])
        transforms = (((a, b, c, d), 0), ((b, a, d, c), 16),
                      ((c, d, a, b), 48), ((d, c, b, a), 32),
                      ((b, c, d, a), 96), ((c, b, a, d), 112),
                      ((d, a, b, c), 80), ((a, d, c, b), 64))
        for corners, orientation in transforms:
            key = corners[0] << 9 | corners[1] << 6 | corners[2] << 3 | corners[3]
            if not assigned[key]:
                table[key*2:key*2+2] = bytes((tile, orientation))
                assigned[key] = 1
    return bytes(table)


def normalize_actor_styles(raw):
    """Read movement's signed low word and 7FAD0's two signed dword caps."""
    if len(raw) != 64:
        raise ValueError('actor style parameter length must be 64')
    return {
        'actorClassSpeeds': [struct.unpack_from('<h', raw, style*16)[0] for style in range(4)],
        'blueprintStat17Caps': [struct.unpack_from('<i', raw, style*16+8)[0] for style in range(4)],
        'blueprintStat19Caps': [struct.unpack_from('<i', raw, style*16+12)[0] for style in range(4)],
    }


def normalize_actor_descriptors(raw):
    """Return source filenames in style/category key order, never native pointers."""
    if len(raw) != 16*44:
        raise ValueError('actor descriptor length must be 704')
    names = []
    for key in range(16):
        record = raw[key*44:(key+1)*44]
        terminator = record.find(b'\0', 0, 28)
        if terminator < 1:
            raise ValueError('unterminated actor descriptor name')
        if any(record[terminator:28]):
            raise ValueError('nonzero actor descriptor name padding')
        try:
            name = record[:terminator].decode('ascii')
        except UnicodeDecodeError as error:
            raise ValueError('non-ASCII actor descriptor name') from error
        if (not name.startswith('data/spec/') or not name.endswith('.anb')
                or '..' in name or '\\' in name or ':' in name):
            raise ValueError('unsafe actor resource name')
        # Raw pointer is object-relative before LE relocation. Its proven
        # semantic destination is a resource slot, represented by this key.
        if struct.unpack_from('<I', record, 28)[0] != 0x168F4+key*4:
            raise ValueError('actor descriptor resource slot mismatch')
        names.append(name)
    if len(set(names)) != 16:
        raise ValueError('duplicate actor resource descriptor names')
    return names


def import_rules(executable_bytes):
    """Return JSON-safe numeric tables and hash provenance, never code bytes."""
    if not isinstance(executable_bytes, (bytes, bytearray, memoryview)):
        raise ValueError('rules input must be executable bytes')
    if len(executable_bytes) > MAX_FILE_BYTES:
        raise ValueError('rules executable exceeds bound')
    executable_sha = sha(executable_bytes)
    if executable_sha != EXECUTABLE_SHA256:
        raise ValueError('unrecognized rules executable variant: '+executable_sha)
    image, tables, records = LEImage(executable_bytes), {}, {}
    for name, number, offset, kind, count, expected in TABLES:
        form = '<'+str(count)+kind
        length = struct.calcsize(form)
        raw = image.read_object(number, offset, length)
        actual = sha(raw)
        if actual != expected:
            raise ValueError('rules table hash mismatch: '+name)
        tables[name] = list(struct.unpack(form, raw))
        records[name] = {'method': 'LE normal pages; no relocations', 'object': number,
                         'objectOffset': offset, 'virtualAddress': image.objects[number-1]['base']+offset,
                         'bytes': length, 'elementFormat': kind, 'elements': count, 'sha256': actual}
    source_ranges = {}
    for name, number, offset, length, expected in AUXILIARY_TABLES:
        raw = image.read_object(number, offset, length)
        if sha(raw) != expected:
            raise ValueError('rules table hash mismatch: '+name)
        source_ranges[name] = {'object': number, 'objectOffset': offset,
                               'virtualAddress': image.objects[number-1]['base']+offset,
                               'bytes': length, 'sha256': expected,
                               'method': 'LE normal pages; no relocations'}
        if name == 'actorStyleParameters':
            tables.update(normalize_actor_styles(raw))
            for output, field, kind in (('actorClassSpeeds', 0, 'h'),
                                        ('blueprintStat17Caps', 8, 'i'),
                                        ('blueprintStat19Caps', 12, 'i')):
                records[output] = {**source_ranges[name], 'inputRange': name,
                                   'columnOffset': field, 'recordStride': 16,
                                   'elementFormat': kind, 'elements': 4,
                                   'normalizedSha256': sha(struct.pack('<4'+kind, *tables[output]))}
        elif name == 'actorResourceDescriptors':
            tables['actorResourceNames'] = normalize_actor_descriptors(raw)
            records['actorResourceNames'] = {**source_ranges[name], 'recordStride': 44,
                                             'nameBytes': 28, 'elements': 16,
                                             'elementFormat': 'ASCII NUL-terminated filename',
                                             'keyRule': '4*style+category',
                                             'nativePointersOmitted': True}
            source_ranges[name]['bindings'] = [
                {'key': key, 'style': key//4, 'category': key%4,
                 'descriptorVirtualAddress': 0x104074+44*key,
                 'resourceSlotVirtualAddress': 0x1168F4+4*key,
                 'animationSlotVirtualAddress': 0x116934+4*key}
                for key in range(16)]
    for name in ('buildingHealth', 'buildingProgressThresholds'):
        if name in records:
            records[name]['layout'] = 'selector*3+grade; 14 selectors, 3 grades'
    if 'buildingProgressThresholds' in records:
        records['buildingProgressThresholds']['consumer'] = '43960 reads grade0; compares signed player progress to unsigned threshold, excludes threshold>=30'
    if 'buildingPrerequisites' in records:
        records['buildingPrerequisites']['sentinel'] = 255
        records['buildingPrerequisites']['consumer'] = '43960: completed prerequisite count or existing owned selector bit; 255 has no prerequisite'
    border = build_terrain_border(bytes(tables['terrainCornerPatterns']))
    if sha(border) != TERRAIN_BORDER_SHA256:
        raise ValueError('generated terrain border table hash mismatch')
    tables['terrainBorder'] = list(border)
    records['terrainBorder'] = {'method': 'four-corner symmetry; first assignment wins',
                                'inputTable': 'terrainCornerPatterns', 'bytes': len(border),
                                'elementFormat': 'B', 'elements': len(border),
                                'sha256': sha(border), 'initializedVirtualAddress': 0x112D24,
                                'sourceRoutine': '0x884D0'}
    return {'schemaVersion': 1, 'tables': tables,
            'provenance': {'executableSha256': executable_sha, 'format': 'LE',
                           'leOffset': image.le_offset, 'pageSize': image.page_size,
                           'pageCount': image.page_count, 'objects': image.objects,
                           'tables': records, 'sourceRanges': source_ranges,
                           'notes': [
                               'Actor style parameter at row+4 is unclassified and omitted.',
                               'Actor constructor inline stores are behavior in actor_initialization, not an executable data table.',
                               'Building health also supplies construction completion thresholds; data import does not establish every building callback.',
                               'Descriptor resource slots are provenance coordinates; runtime resolves resource keys to owned asset handles.',
                           ], 'originalExecution': False}}
