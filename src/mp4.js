/* Zippy AI Tools — minimal MP4 muxer (single video track, no dependencies).
 *
 * Why this exists: the browser can encode video frames (WebCodecs) but cannot
 * wrap them in an MP4 container. MediaRecorder only produces WebM in Firefox
 * and in Safari's older builds, so we write the ISO-BMFF boxes ourselves.
 *
 * Scope on purpose — one video track, constant frame duration, no audio,
 * faststart (moov before mdat). That is all the exporter needs.
 *
 *   var file = Mp4Muxer.build({
 *     codec: 'avc' | 'vp9',
 *     width: 1280, height: 720, fps: 30,
 *     description: Uint8Array,          // avcC payload (avc only)
 *     chunks: [{ data: Uint8Array, isKey: true }, ...]
 *   });
 */
window.Mp4Muxer = (function () {
  'use strict';

  /* ---------- byte helpers ---------- */

  function concat(parts) {
    var len = 0, i, off = 0;
    for (i = 0; i < parts.length; i++) len += parts[i].length;
    var out = new Uint8Array(len);
    for (i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length; }
    return out;
  }

  function u32(v) {
    return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
  }

  function u16(v) {
    return new Uint8Array([(v >> 8) & 255, v & 255]);
  }

  function zeros(n) {
    return new Uint8Array(n);
  }

  function fourcc(s) {
    return new Uint8Array([s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)]);
  }

  /* box(type, ...payload) -> [size][type][payload] */
  function box(type) {
    var body = concat(Array.prototype.slice.call(arguments, 1));
    return concat([u32(body.length + 8), fourcc(type), body]);
  }

  /* fullbox(type, version, flags, ...payload) -> adds the 4-byte version/flags word */
  function fullbox(type, version, flags) {
    var body = concat(Array.prototype.slice.call(arguments, 3));
    var head = concat([new Uint8Array([version]), u32(flags).subarray(1)]);
    return box(type, head, body);
  }

  var MATRIX = concat([
    u32(0x00010000), u32(0), u32(0),
    u32(0), u32(0x00010000), u32(0),
    u32(0), u32(0), u32(0x40000000)
  ]);

  /* ---------- sample entries ---------- */

  /* The 78-byte preamble shared by avc1 / vp09 sample entries. */
  function visualSampleEntry(kind, w, h, trailing) {
    return box(kind,
      zeros(6), u16(1),                                  /* reserved, data_reference_index */
      u16(0), u16(0), zeros(12),                         /* pre_defined, reserved, pre_defined[3] */
      u16(w), u16(h),
      u32(0x00480000), u32(0x00480000),                  /* 72 dpi horizontal / vertical */
      u32(0), u16(1),                                    /* reserved, frame_count */
      zeros(32),                                         /* compressorname (Pascal string) */
      u16(0x0018), u16(0xFFFF),                          /* depth, pre_defined = -1 */
      trailing);
  }

  /* Codec configuration for VP9 profile 0, 8-bit, 4:2:0, BT.709. */
  function vpcCBox() {
    return fullbox('vpcC', 1, 0,
      new Uint8Array([0 /* profile */, 10 /* level 1.0 */, 0x80 /* 8-bit, 4:2:0, limited range */]),
      new Uint8Array([2, 2, 2]),                         /* primaries, transfer, matrix = unspecified */
      u16(0));                                           /* codecInitializationDataSize */
  }

  function sampleEntry(opt) {
    if (opt.codec === 'avc') {
      var avcC = opt.description
        ? box('avcC', opt.description)
        : box('avcC', new Uint8Array([1, 0x42, 0xE0, 0x1E, 0xFF, 0xE1, 0x00, 0x06, 0x67, 0x42, 0xE0, 0x1E, 0xDA, 0x02, 0xD0, 0x01]));
      return visualSampleEntry('avc1', opt.width, opt.height, avcC);
    }
    return visualSampleEntry('vp09', opt.width, opt.height, vpcCBox());
  }

  /* ---------- movie boxes ---------- */

  function moov(opt, n, dataOffset) {
    var fps = opt.fps;
    var trackTs = fps * 1000;          /* exact frame delta */
    var delta = 1000;
    var trackDur = n * delta;
    var movieTs = 1000;
    var movieDur = Math.round((n * 1000) / fps);

    /* stts — constant duration means a single entry */
    var stts = fullbox('stts', 0, 0, u32(1), u32(n), u32(delta));

    /* stss — sample numbers (1-based) that can be seeked to */
    var keys = [], i;
    for (i = 0; i < n; i++) if (opt.chunks[i].isKey) keys.push(i + 1);
    if (!keys.length) keys = [1];
    var stssParts = [u32(keys.length)];
    for (i = 0; i < keys.length; i++) stssParts.push(u32(keys[i]));
    var stss = fullbox('stss', 0, 0, concat(stssParts));

    /* stsc — one chunk holding every sample */
    var stsc = fullbox('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1));

    /* stsz — per-sample sizes */
    var sizes = [u32(0), u32(n)];
    for (i = 0; i < n; i++) sizes.push(u32(opt.chunks[i].data.length));
    var stsz = fullbox('stsz', 0, 0, concat(sizes));

    /* stco — byte offset of the single chunk */
    var stco = fullbox('stco', 0, 0, u32(1), u32(dataOffset));

    var stbl = box('stbl',
      fullbox('stsd', 0, 0, u32(1), sampleEntry(opt)),
      stts, stss, stsc, stsz, stco);

    var minf = box('minf',
      fullbox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)),
      box('dinf', fullbox('dref', 0, 0, u32(1), fullbox('url ', 0, 1))),
      stbl);

    var hdlr = fullbox('hdlr', 0, 0,
      u32(0), fourcc('vide'), u32(0), u32(0), u32(0),
      new Uint8Array([0x56, 0x69, 0x64, 0x65, 0x6F, 0x00]));   /* "Video\0" */

    var mdhd = fullbox('mdhd', 0, 0,
      u32(0), u32(0), u32(trackTs), u32(trackDur),
      u16(0x55C4), u16(0));                                    /* language "und" */

    var mdia = box('mdia', mdhd, hdlr, minf);

    var tkhd = fullbox('tkhd', 0, 3,
      u32(0), u32(0), u32(1), u32(0), u32(trackDur),           /* created, modified, trackID, reserved, duration */
      zeros(8), u16(0), u16(0), u16(0), u16(0),                /* reserved, layer, group, volume, reserved */
      MATRIX,
      u32(opt.width * 65536), u32(opt.height * 65536));

    var mvhd = fullbox('mvhd', 0, 0,
      u32(0), u32(0), u32(movieTs), u32(movieDur),
      u32(0x00010000), u16(0x0100), u16(0), zeros(8),
      MATRIX, zeros(24), u32(2));

    return box('moov', mvhd, box('trak', tkhd, mdia));
  }

  /* ---------- public ---------- */

  function build(opt) {
    var n = opt.chunks.length;
    if (!n) throw new Error('No frames to write');

    var major = 'isom';
    var compat = opt.codec === 'avc'
      ? ['isom', 'iso2', 'avc1', 'mp41']
      : ['isom', 'iso2', 'mp41'];

    var compatParts = [];
    for (var c = 0; c < compat.length; c++) compatParts.push(fourcc(compat[c]));

    var ftyp = box('ftyp', fourcc(major), u32(512), concat(compatParts));

    /* Two passes: the chunk offset depends on how long moov turns out to be. */
    var probe = moov(opt, n, 0);
    var dataOffset = ftyp.length + probe.length + 8;   /* + mdat header */
    var head = moov(opt, n, dataOffset);

    var payload = [];
    for (var i = 0; i < n; i++) payload.push(opt.chunks[i].data);
    var mdat = box('mdat', concat(payload));

    return concat([ftyp, head, mdat]);
  }

  return { build: build };
})();
