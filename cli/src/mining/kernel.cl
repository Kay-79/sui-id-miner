// BLAKE2b-256 & SHA3-256 OpenCL Implementation
// Optimized for Sui ID Mining (Native 64-bit)

typedef ulong uint64_t;
typedef uint uint32_t;
typedef uchar uint8_t;

// ============================================================================
// Common Helpers
// ============================================================================

inline uint64_t load64(const uint8_t *src) {
  uint64_t w = (uint64_t)src[0];
  w |= (uint64_t)src[1] << 8;
  w |= (uint64_t)src[2] << 16;
  w |= (uint64_t)src[3] << 24;
  w |= (uint64_t)src[4] << 32;
  w |= (uint64_t)src[5] << 40;
  w |= (uint64_t)src[6] << 48;
  w |= (uint64_t)src[7] << 56;
  return w;
}

inline uint64_t load64_constant(__constant const uint8_t *src) {
  uint64_t w = (uint64_t)src[0];
  w |= (uint64_t)src[1] << 8;
  w |= (uint64_t)src[2] << 16;
  w |= (uint64_t)src[3] << 24;
  w |= (uint64_t)src[4] << 32;
  w |= (uint64_t)src[5] << 40;
  w |= (uint64_t)src[6] << 48;
  w |= (uint64_t)src[7] << 56;
  return w;
}

// ============================================================================
// BLAKE2B-256 Implementation
// ============================================================================

#define R1 32
#define R2 24
#define R3 16
#define R4 63

#define G(v, a, b, c, d, x, y)                                                 \
  {                                                                            \
    v[a] = v[a] + v[b] + x;                                                    \
    v[d] = rotate(v[d] ^ v[a], (uint64_t)(64 - R1));                           \
    v[c] = v[c] + v[d];                                                        \
    v[b] = rotate(v[b] ^ v[c], (uint64_t)(64 - R2));                           \
    v[a] = v[a] + v[b] + y;                                                    \
    v[d] = rotate(v[d] ^ v[a], (uint64_t)(64 - R3));                           \
    v[c] = v[c] + v[d];                                                        \
    v[b] = rotate(v[b] ^ v[c], (uint64_t)(64 - R4));                           \
  }

__constant uint64_t blake2b_IV[8] = {
    0x6a09e667f3bcc908UL, 0xbb67ae8584caa73bUL, 0x3c6ef372fe94f82bUL,
    0xa54ff53a5f1d36f1UL, 0x510e527fade682d1UL, 0x9b05688c2b3e6c1fUL,
    0x1f83d9abfb41bd6bUL, 0x5be0cd19137e2179UL};

__constant uint8_t blake2b_sigma[12][16] = {
    {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15},
    {14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3},
    {11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4},
    {7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8},
    {9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13},
    {2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9},
    {12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11},
    {13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10},
    {6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5},
    {10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0},
    {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15},
    {14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3}};

typedef struct {
  uint64_t h[8];
  uint64_t t[2];
  uint64_t f[2];
  uint8_t buf[128];
  size_t buflen;
} blake2b_ctx;

static void blake2b_compress(blake2b_ctx *ctx, int is_last_block) {
  uint64_t v[16];
  uint64_t m[16];

  for (int i = 0; i < 16; ++i) {
    m[i] = load64(ctx->buf + i * 8);
  }

  for (int i = 0; i < 8; ++i) {
    v[i] = ctx->h[i];
  }
  v[8] = blake2b_IV[0];
  v[9] = blake2b_IV[1];
  v[10] = blake2b_IV[2];
  v[11] = blake2b_IV[3];
  v[12] = blake2b_IV[4] ^ ctx->t[0];
  v[13] = blake2b_IV[5] ^ ctx->t[1];
  v[14] = blake2b_IV[6] ^ ctx->f[0];
  v[15] = blake2b_IV[7] ^ ctx->f[1];

  for (int r = 0; r < 12; ++r) {
    G(v, 0, 4, 8, 12, m[blake2b_sigma[r][0]], m[blake2b_sigma[r][1]]);
    G(v, 1, 5, 9, 13, m[blake2b_sigma[r][2]], m[blake2b_sigma[r][3]]);
    G(v, 2, 6, 10, 14, m[blake2b_sigma[r][4]], m[blake2b_sigma[r][5]]);
    G(v, 3, 7, 11, 15, m[blake2b_sigma[r][6]], m[blake2b_sigma[r][7]]);
    G(v, 0, 5, 10, 15, m[blake2b_sigma[r][8]], m[blake2b_sigma[r][9]]);
    G(v, 1, 6, 11, 12, m[blake2b_sigma[r][10]], m[blake2b_sigma[r][11]]);
    G(v, 2, 7, 8, 13, m[blake2b_sigma[r][12]], m[blake2b_sigma[r][13]]);
    G(v, 3, 4, 9, 14, m[blake2b_sigma[r][14]], m[blake2b_sigma[r][15]]);
  }

  for (int i = 0; i < 8; ++i) {
    ctx->h[i] = ctx->h[i] ^ v[i] ^ v[i + 8];
  }
}

static void blake2b_init(blake2b_ctx *ctx) {
  for (int i = 0; i < 8; ++i) {
    ctx->h[i] = blake2b_IV[i];
  }
  ctx->h[0] ^= 0x01010020; // 0x01010000 | 32 (output len)

  ctx->t[0] = 0;
  ctx->t[1] = 0;
  ctx->f[0] = 0;
  ctx->f[1] = 0;
  ctx->buflen = 0;
}

static void blake2b_increment_counter(blake2b_ctx *ctx, uint64_t inc) {
  ctx->t[0] += inc;
  if (ctx->t[0] < inc) {
    ctx->t[1]++;
  }
}

static void blake2b_update(blake2b_ctx *ctx, const uint8_t *data, size_t len) {
  size_t offset = 0;
  while (len > 0) {
    if (ctx->buflen == 128) {
      blake2b_increment_counter(ctx, 128);
      blake2b_compress(ctx, 0);
      ctx->buflen = 0;
    }
    size_t left = 128 - ctx->buflen;
    size_t fill = (len < left) ? len : left;
    for (size_t i = 0; i < fill; ++i) {
      ctx->buf[ctx->buflen + i] = data[offset + i];
    }
    ctx->buflen += fill;
    offset += fill;
    len -= fill;
  }
}

static void blake2b_update_constant(blake2b_ctx *ctx,
                                    __constant const uint8_t *data,
                                    size_t len) {
  size_t offset = 0;
  while (len > 0) {
    if (ctx->buflen == 128) {
      blake2b_increment_counter(ctx, 128);
      blake2b_compress(ctx, 0);
      ctx->buflen = 0;
    }
    size_t left = 128 - ctx->buflen;
    size_t fill = (len < left) ? len : left;
    for (size_t i = 0; i < fill; ++i) {
      ctx->buf[ctx->buflen + i] = data[offset + i];
    }
    ctx->buflen += fill;
    offset += fill;
    len -= fill;
  }
}

static void blake2b_final(blake2b_ctx *ctx, uint8_t *out) {
  blake2b_increment_counter(ctx, ctx->buflen);
  ctx->f[0] = 0xFFFFFFFFFFFFFFFFUL;

  for (size_t i = ctx->buflen; i < 128; ++i) {
    ctx->buf[i] = 0;
  }

  blake2b_compress(ctx, 1);

  for (int i = 0; i < 4; ++i) {
    uint64_t val = ctx->h[i];
    out[i * 8 + 0] = (uint8_t)(val);
    out[i * 8 + 1] = (uint8_t)(val >> 8);
    out[i * 8 + 2] = (uint8_t)(val >> 16);
    out[i * 8 + 3] = (uint8_t)(val >> 24);
    out[i * 8 + 4] = (uint8_t)(val >> 32);
    out[i * 8 + 5] = (uint8_t)(val >> 40);
    out[i * 8 + 6] = (uint8_t)(val >> 48);
    out[i * 8 + 7] = (uint8_t)(val >> 56);
  }
}

// ============================================================================
// SHA3-256 (Keccak-f1600) Implementation
// ============================================================================

__constant uint64_t keccakf_rndc[24] = {
    0x0000000000000001UL, 0x0000000000008082UL, 0x800000000000808aUL,
    0x8000000080008000UL, 0x000000000000808bUL, 0x0000000080000001UL,
    0x8000000080008081UL, 0x8000000000008009UL, 0x000000000000008aUL,
    0x0000000000000088UL, 0x0000000080008009UL, 0x000000008000000aUL,
    0x000000008000808bUL, 0x800000000000008bUL, 0x8000000000008089UL,
    0x8000000000008003UL, 0x8000000000008002UL, 0x8000000000000080UL,
    0x000000000000800aUL, 0x800000008000000aUL, 0x8000000080008081UL,
    0x8000000000008080UL, 0x0000000080000001UL, 0x8000000080008008UL};

__constant int keccakf_rotc[24] = {1,  3,  6,  10, 15, 21, 28, 36,
                                   45, 55, 2,  14, 27, 41, 56, 8,
                                   25, 43, 62, 18, 39, 61, 20, 44};

__constant int keccakf_pil[24] = {10, 7,  11, 17, 18, 3, 5,  16, 8,  21, 24, 4,
                                  15, 23, 19, 13, 12, 2, 20, 14, 22, 9,  6,  1};

static void keccak_f1600(uint64_t *state) {
  int i, j, r;
  uint64_t t, bc[5];

  for (r = 0; r < 24; r++) {
    // Theta
    for (i = 0; i < 5; i++)
      bc[i] = state[i] ^ state[i + 5] ^ state[i + 10] ^ state[i + 15] ^
              state[i + 20];

    for (i = 0; i < 5; i++) {
      t = bc[(i + 4) % 5] ^ rotate(bc[(i + 1) % 5], (uint64_t)1);
      for (j = 0; j < 25; j += 5)
        state[j + i] ^= t;
    }

    // Rho Pi
    t = state[1];
    for (i = 0; i < 24; i++) {
      j = keccakf_pil[i];
      bc[0] = state[j];
      state[j] = rotate(t, (uint64_t)keccakf_rotc[i]);
      t = bc[0];
    }

    // Chi
    for (j = 0; j < 25; j += 5) {
      for (i = 0; i < 5; i++)
        bc[i] = state[j + i];
      for (i = 0; i < 5; i++)
        state[j + i] ^= (~bc[(i + 1) % 5]) & bc[(i + 2) % 5];
    }

    // Iota
    state[0] ^= keccakf_rndc[r];
  }
}

// Minimal SHA3-256 for this specific use case
// Inputs: 32 bytes digest + 8 bytes index
// Total input = 40 bytes.
// Rate (r) for SHA3-256 is 1088 bits = 136 bytes.
// Input (40) < Rate (136).
// So just one block.
// Padding: 0x06, then 0x80 at end of rate (byte 135).
// BUT OpenCL uses 64-bit words (state[25]).
// r = 136 bytes = 17 uint64 words.
static void sha3_256_hash_derived(const uint8_t *digest_32, uint64_t index,
                                  uint8_t *out) {
  uint64_t state[25];
  for (int i = 0; i < 25; i++)
    state[i] = 0;

  // Load digest (32 bytes) = 4 uint64 words
  state[0] = load64(digest_32);
  state[1] = load64(digest_32 + 8);
  state[2] = load64(digest_32 + 16);
  state[3] = load64(digest_32 + 24);

  // Load index (8 bytes) = 1 uint64 word
  state[4] = index;

  // Total bytes = 40. Next byte is 40.
  // Padding for SHA3 (domain 01 for SHA3, plus 10*1 padding)
  // 0x06 (binary 00000110) added to byte 40.
  // Byte 40 is the first byte of word 5.
  state[5] ^= 0x06;

  // Final bit of padding: 0x80 at byte 135 (end of block).
  // Word 16 is bytes 128-135.
  // Byte 135 is the MSB of word 16.
  state[16] ^= 0x8000000000000000UL;

  // Permutation
  keccak_f1600(state);

  // Output 256 bits = 32 bytes = 4 words
  for (int i = 0; i < 4; ++i) {
    uint64_t val = state[i];
    out[i * 8 + 0] = (uint8_t)(val);
    out[i * 8 + 1] = (uint8_t)(val >> 8);
    out[i * 8 + 2] = (uint8_t)(val >> 16);
    out[i * 8 + 3] = (uint8_t)(val >> 24);
    out[i * 8 + 4] = (uint8_t)(val >> 32);
    out[i * 8 + 5] = (uint8_t)(val >> 40);
    out[i * 8 + 6] = (uint8_t)(val >> 48);
    out[i * 8 + 7] = (uint8_t)(val >> 56);
  }
}



// ============================================================================
// Verification and Mining Kernels
// ============================================================================

__kernel void verify_blake2b(__constant uint8_t *input, uint32_t input_len,
                             __global uint64_t *out) {
  blake2b_ctx ctx;
  blake2b_init(&ctx);
  blake2b_update_constant(&ctx, input, input_len);

  uint8_t digest[32];
  blake2b_final(&ctx, digest);

  // Output all 4 u64s (32 bytes total)
  for (uint32_t i = 0; i < 4; i++) {
    uint64_t val = 0;
    val |= (uint64_t)digest[i * 8 + 0];
    val |= (uint64_t)digest[i * 8 + 1] << 8;
    val |= (uint64_t)digest[i * 8 + 2] << 16;
    val |= (uint64_t)digest[i * 8 + 3] << 24;
    val |= (uint64_t)digest[i * 8 + 4] << 32;
    val |= (uint64_t)digest[i * 8 + 5] << 40;
    val |= (uint64_t)digest[i * 8 + 6] << 48;
    val |= (uint64_t)digest[i * 8 + 7] << 56;
    out[i] = val;
  }
}

// Prefix Checker
// Returns 1 if match, 0 if not
static int check_prefix(const uint8_t *data, __constant uint8_t *prefix,
                        uint32_t full_bytes, int has_half_byte) {
  for (uint32_t i = 0; i < full_bytes; i++) {
    if (data[i] != prefix[i])
      return 0;
  }
  
  if (has_half_byte) {
    if ((data[full_bytes] & 0xF0) != (prefix[full_bytes] & 0xF0))
      return 0;
  }

  return 1;
}

// Blake2b-256 derivation for Object IDs
// Pattern: Blake2b256(0xf1 || tx_digest || index_le_u64)
static void blake2b_256_hash_derived(const uint8_t *digest_32, uint64_t index,
                                   uint8_t *out) {
  blake2b_ctx ctx;
  blake2b_init(&ctx);

  uint8_t prefix = 0xf1;
  blake2b_update(&ctx, &prefix, 1);
  blake2b_update(&ctx, digest_32, 32);

  uint8_t index_bytes[8];
  index_bytes[0] = (uint8_t)(index);
  index_bytes[1] = (uint8_t)(index >> 8);
  index_bytes[2] = (uint8_t)(index >> 16);
  index_bytes[3] = (uint8_t)(index >> 24);
  index_bytes[4] = (uint8_t)(index >> 32);
  index_bytes[5] = (uint8_t)(index >> 40);
  index_bytes[6] = (uint8_t)(index >> 48);
  index_bytes[7] = (uint8_t)(index >> 56);
  blake2b_update(&ctx, index_bytes, 8);

  blake2b_final(&ctx, out);
}

__kernel void mine_sui_id(__constant uint8_t *intent_bytes,
                           __constant uint8_t *tx_template,
                           __constant uint8_t *target_prefix,
                           __global uint32_t *results_count,
                           __global uint64_t *results,
                           uint64_t start_nonce,
                           uint32_t intent_len,
                           uint32_t tx_len,
                           uint32_t nonce_offset,
                           uint32_t start_index,
                           uint32_t end_index,
                           uint32_t full_bytes,
                           int has_half_byte) {
  size_t gid = get_global_id(0);
  uint64_t nonce = start_nonce + gid;

  blake2b_ctx ctx;
  blake2b_init(&ctx);
  blake2b_update_constant(&ctx, intent_bytes, intent_len);

  if (nonce_offset > 0) {
    blake2b_update_constant(&ctx, tx_template, nonce_offset);
  }

  uint8_t nonce_bytes[8];
  nonce_bytes[0] = (uint8_t)(nonce);
  nonce_bytes[1] = (uint8_t)(nonce >> 8);
  nonce_bytes[2] = (uint8_t)(nonce >> 16);
  nonce_bytes[3] = (uint8_t)(nonce >> 24);
  nonce_bytes[4] = (uint8_t)(nonce >> 32);
  nonce_bytes[5] = (uint8_t)(nonce >> 40);
  nonce_bytes[6] = (uint8_t)(nonce >> 48);
  nonce_bytes[7] = (uint8_t)(nonce >> 56);
  blake2b_update(&ctx, nonce_bytes, 8);

  uint32_t after_nonce = nonce_offset + 8;
  if (tx_len > after_nonce) {
    blake2b_update_constant(&ctx, tx_template + after_nonce,
                            tx_len - after_nonce);
  }

  uint8_t tx_digest[32];
  blake2b_final(&ctx, tx_digest);

  // Now Check Indices
  for (uint32_t idx = start_index; idx < end_index; idx++) {
    uint8_t object_id[32];
    blake2b_256_hash_derived(tx_digest, (uint64_t)idx, object_id);

    // int match = 1; matches check_prefix(...)
    int match = check_prefix(object_id, target_prefix, full_bytes, has_half_byte);

    if (match) {
      uint32_t pos = atomic_inc(results_count);
      if (pos < 10) {
        uint32_t base = pos * 6;
        results[base + 0] = nonce;
        results[base + 1] = idx;

        for (uint32_t w = 0; w < 4; w++) {
          // Output TX Digest (BLAKE2b output before derived ID)
          uint64_t val = 0;
          val |= (uint64_t)tx_digest[w * 8 + 0];
          val |= (uint64_t)tx_digest[w * 8 + 1] << 8;
          val |= (uint64_t)tx_digest[w * 8 + 2] << 16;
          val |= (uint64_t)tx_digest[w * 8 + 3] << 24;
          val |= (uint64_t)tx_digest[w * 8 + 4] << 32;
          val |= (uint64_t)tx_digest[w * 8 + 5] << 40;
          val |= (uint64_t)tx_digest[w * 8 + 6] << 48;
          val |= (uint64_t)tx_digest[w * 8 + 7] << 56;
          results[base + 2 + w] = val;
        }
      }
      break;
    }
  }
}



__kernel void test_sha3_known(__constant uint8_t *data, __global uint64_t *out) {
  // Test SHA3-256 on 40 bytes of input data
  // To match how sha3_256_hash_derived works, we manually set up state.

  uint64_t state[25];
  for (int i = 0; i < 25; i++)
    state[i] = 0;

  // Load into state from input buffer
  // Word 0: 0..7
  state[0] = load64_constant(data);
  // Word 1: 8..15
  state[1] = load64_constant(data + 8);
  // Word 2: 16..23
  state[2] = load64_constant(data + 16);
  // Word 3: 24..31
  state[3] = load64_constant(data + 24);
  // Word 4: 32..39
  state[4] = load64_constant(data + 32);

  // Padding at byte 40 (start of word 5)
  state[5] ^= 0x06;
  state[16] ^= 0x8000000000000000UL;

  keccak_f1600(state);

  for (int i = 0; i < 4; ++i) {
    out[i] = state[i];
  }
}
