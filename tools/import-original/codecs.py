"""Independently expressed, bounded GeneWars format readers. No game code executes.

Format evidence: preservation repository research/formats/rnc.md and the
ANB/map contracts in genewars-assets. No archived source is copied or relicensed.
"""
import binascii
import struct
import zlib

LIMIT = 64 * 1024 * 1024


def crc16(data):
    value = 0
    for byte in data:
        value ^= byte
        for _ in range(8):
            value = (value >> 1) ^ (0xA001 if value & 1 else 0)
    return value


class Bits:
    def __init__(self, data):
        self.data, self.cursor, self.word, self.left = data, 0, 0, 0

    def read(self, count):
        if not 0 <= count <= 32:
            raise ValueError('invalid bit count')
        result = 0
        for shift in range(count):
            if self.left == 0:
                if self.cursor >= len(self.data) + 2:
                    raise ValueError('truncated RNC control stream')
                self.word = int.from_bytes(self.data[self.cursor:self.cursor + 2], 'little')
                self.cursor += 2
                self.left = 16
            result |= (self.word & 1) << shift
            self.word >>= 1
            self.left -= 1
        return result

    def peek(self, count):
        saved = self.cursor, self.word, self.left
        try:
            return self.read(count)
        finally:
            self.cursor, self.word, self.left = saved

    def literals(self, count):
        if count == 0:
            return b''
        end = self.cursor + count
        if end > len(self.data):
            raise ValueError('truncated RNC literals')
        result = self.data[self.cursor:end]
        self.cursor = end
        return result


def huffman(bits, previous):
    count = bits.read(5)
    if not count:
        return previous
    if count > 16:
        raise ValueError('RNC Huffman symbol limit')
    lengths = [bits.read(4) for _ in range(count)]
    table, code, slots = [], 0, 1
    for depth in range(1, 17):
        slots = slots * 2 - lengths.count(depth)
        if slots < 0:
            raise ValueError('oversubscribed RNC Huffman table')
        for symbol, length in enumerate(lengths):
            if length == depth:
                reverse = int(f'{code:0{depth}b}'[::-1], 2)
                table.append((depth, reverse, symbol))
                code += 1
        code <<= 1
    return table


def symbol(bits, table):
    for depth, code, index in table:
        if bits.peek(depth) == code:
            bits.read(depth)
            return index if index < 2 else (1 << (index - 1)) + bits.read(index - 1)
    raise ValueError('invalid RNC Huffman code')


def rnc(data, limit=LIMIT):
    if len(data) < 18 or data[:4] != b'RNC\x01':
        raise ValueError('only RNC method 1 is supported')
    expected, packed, output_crc, input_crc = struct.unpack_from('>IIHH', data, 4)
    if expected > limit or len(data) != packed + 18:
        raise ValueError('RNC length/limit mismatch; trailing containers are not guessed')
    payload = data[18:]
    if crc16(payload) != input_crc:
        raise ValueError('RNC packed CRC mismatch')
    bits = Bits(payload)
    if bits.read(2):
        raise ValueError('locked/encrypted RNC is unsupported')
    output, tables, blocks = bytearray(), [[], [], []], 0
    while len(output) < expected:
        blocks += 1
        if blocks > (data[17] or 65535):
            raise ValueError('RNC block count mismatch')
        tables = [huffman(bits, t) for t in tables]
        chunks = bits.read(16)
        if not chunks:
            raise ValueError('empty RNC block')
        for chunk in range(chunks):
            count = symbol(bits, tables[0])
            if len(output) + count > expected:
                raise ValueError('RNC literal output overflow')
            output.extend(bits.literals(count))
            if len(output) == expected:
                if chunk != chunks - 1:
                    raise ValueError('early RNC completion')
                break
            if chunk != chunks - 1:
                distance = symbol(bits, tables[1]) + 1
                length = symbol(bits, tables[2]) + 2
                if distance > len(output) or len(output) + length > expected:
                    raise ValueError('invalid RNC backreference')
                for _ in range(length):
                    output.append(output[-distance])
    if data[17] and blocks != data[17] or crc16(output) != output_crc:
        raise ValueError('RNC output CRC/block mismatch')
    return bytes(output)


def unpack(data):
    return rnc(data) if data.startswith(b'RNC') else data


def png(width, height, rgba):
    if not 0 < width <= 4096 or not 0 < height <= 16384 or len(rgba) != width * height * 4:
        raise ValueError('invalid PNG bounds')
    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', binascii.crc32(kind + body))
    scanlines = b''.join(b'\0' + rgba[y * width * 4:(y + 1) * width * 4] for y in range(height))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(scanlines, 9)) + chunk(b'IEND', b''))


def palette(data):
    if len(data) != 768 or max(data) > 63:
        raise ValueError('expected 768-byte RGB6 palette')
    return [tuple(v * 255 // 63 for v in data[i:i + 3]) for i in range(0, 768, 3)]


def indexed_png(width, height, indices, colors):
    if len(indices) != width * height:
        raise ValueError('indexed image dimensions do not match')
    return png(width, height, b''.join(bytes((*colors[v], 255)) for v in indices))


def sprite(data, offset, width, height, bound, packed4=False):
    pixels, mask = bytearray(width * height), bytearray(width * height)
    if not width or not height:
        return pixels, mask
    cursor = 18 + offset
    if cursor >= bound:
        raise ValueError('sprite offset points into metadata')
    for y in range(height):
        x = 0
        while True:
            if cursor >= bound:
                raise ValueError('sprite stream crosses metadata boundary')
            run = struct.unpack_from('b', data, cursor)[0]
            cursor += 1
            if run == 0:
                break
            if run > 0:
                count = (run + 1) // 2 if packed4 else run
                if cursor + count > bound:
                    raise ValueError('truncated sprite literals')
                for i in range(min(run, width - x)):
                    v = data[cursor + (i // 2 if packed4 else i)]
                    pixels[y * width + x + i] = ((v >> 4) if i % 2 == 0 else (v & 15)) if packed4 else v
                    mask[y * width + x + i] = 255
                cursor += count
            x = min(width, x + abs(run))
    return pixels, mask


def anb(data, colors, packed4=False):
    if len(data) < 18:
        raise ValueError('short ANB header')
    count, a, b, c, d = struct.unpack_from('<HIIII', data)
    if not 18 <= a <= b <= c <= d <= len(data) or (b-a) % 6 or (c-b) % 10 or (d-c) % 14 or len(data)-d != count*10:
        raise ValueError('invalid ANB section layout')
    records, decoded, px, py, row = [], [], 0, 0, 0
    for pos in range(a, b, 6):
        offset, width, height = struct.unpack_from('<IBB', data, pos)
        indices, mask = sprite(data, offset, width, height, a, packed4)
        if px + width > 1024:
            px, py, row = 0, py + row + 1, 0
        records.append([px, py, width, height])
        decoded.append((indices, mask))
        px += width + 1
        row = max(row, height)
    height = max(1, py + row)
    if height > 16384:
        raise ValueError('ANB atlas exceeds height limit')
    rgba = bytearray(1024 * height * 4)
    for (sx, sy, sw, sh), (indices, mask) in zip(records, decoded):
        for y in range(sh):
            for x in range(sw):
                idx = y*sw+x
                if mask[idx]:
                    out = ((sy+y)*1024+sx+x)*4
                    rgba[out:out+4] = bytes((*colors[indices[idx]], 255))
    components, source_components = [], []
    for pos in range(b, c, 10):
        ref, x, y, flags, extra = struct.unpack_from('<IhhBB', data, pos)
        if ref % 6 or ref // 6 >= len(records):
            raise ValueError('ANB component sprite reference out of range')
        components.append([ref//6, x >> 1, y >> 1, flags, extra])
        source_components.append([ref//6, x, y, flags, extra])
    frames = []
    for pos in range(c, d, 14):
        ref, width, ht = struct.unpack_from('<Ihh', data, pos)
        n = data[pos+11]
        if ref % 10 or ref//10+n > len(components):
            raise ValueError('ANB frame component range')
        frames.append({'components': components[ref//10:ref//10+n], 'sourceComponents': source_components[ref//10:ref//10+n], 'sourceSize': [width, ht], 'width': width >> 1, 'height': ht >> 1,
                       'rawFlags': [data[pos+10], data[pos+12], data[pos+13]]})
    animations = []
    for pos in range(d, len(data), 10):
        first, last, trailing = struct.unpack_from('<IIH', data, pos)
        if first % 14 or last % 14 or first//14 >= len(frames) or last//14 >= len(frames):
            raise ValueError('ANB animation frame range')
        animations.append({'first': first//14, 'last': last//14, 'rawTrailingWord': trailing})
    return {'sprites': records, 'frames': frames, 'animations': animations,
            'paletteMode': 'raw-nibbles-diagnostic' if packed4 else 'main-rgb6',
            'imageBytes': png(1024, height, rgba)}


def mission(data, header, number):
    if len(data) != 343958 or struct.unpack_from('<I', data)[0] != 0x55336 or struct.unpack_from('<I', data, 337054)[0] != 0x6BE:
        raise ValueError('unsupported mission source variant (expected QA BETA V5 CONQ layout)')
    if len(header) != 699 or b'\0' not in header[32:]:
        raise ValueError('unsupported mission header')
    cells = [struct.unpack_from('<hBB', data, 0x355e + i*14 + 2) for i in range(128*128)]
    target = list(struct.unpack_from('<HH', data, 0x1c7e))
    return {'id': number, 'name': header[32:].split(b'\0', 1)[0].decode('cp437'),
            'width': 128, 'height': 128, 'cells': cells, 'target': target,
            'sourceSeed': None,  # original RNG startup is not inferred from an opaque prefix dword
            'runtimeStatus': 'not-integrated', 'briefing': '',
            'unknown': ['Serialized pools require runtime initialization', 'Later mission predicates and AI are not integrated']}
