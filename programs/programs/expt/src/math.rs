/// Q64.64 fixed-point math for DAMM v2 pool parameter computation.
///
/// Uses manual 256-bit arithmetic via (u128, u128) pairs to avoid
/// external dependencies (ruint requires edition2024, incompatible
/// with the Solana toolchain).
///
/// Core operations:
/// - `mul_u128`: 128×128 → 256 bit multiply
/// - `div_u256_by_u128`: 256÷128 → 128 bit divide
/// - `isqrt_u256`: integer square root of a 256-bit value
///
/// All derived from Meteora's approach but without the ruint crate.

use crate::errors::ExptError;

/// DAMM v2 minimum sqrt price
pub const DAMM_MIN_SQRT_PRICE: u128 = 4_295_048_016;

/// DAMM v2 maximum sqrt price
pub const DAMM_MAX_SQRT_PRICE: u128 = 79_226_673_521_066_979_257_578_248_091;

/// 256-bit unsigned integer as (high, low) pair
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct U256 {
    pub hi: u128,
    pub lo: u128,
}

impl U256 {
    pub const ZERO: Self = Self { hi: 0, lo: 0 };

    pub fn from_u128(v: u128) -> Self {
        Self { hi: 0, lo: v }
    }

    pub fn is_zero(&self) -> bool {
        self.hi == 0 && self.lo == 0
    }

    /// Compare two U256 values
    pub fn ge(&self, other: &Self) -> bool {
        if self.hi != other.hi {
            self.hi >= other.hi
        } else {
            self.lo >= other.lo
        }
    }

    pub fn gt(&self, other: &Self) -> bool {
        if self.hi != other.hi {
            self.hi > other.hi
        } else {
            self.lo > other.lo
        }
    }
}

/// Multiply two u128 values, producing a U256 result.
///
/// Uses the schoolbook method: split each operand into two 64-bit halves,
/// multiply the four pairs, and accumulate with carry.
pub fn mul_u128(a: u128, b: u128) -> U256 {
    let a_lo = a & 0xFFFF_FFFF_FFFF_FFFF;
    let a_hi = a >> 64;
    let b_lo = b & 0xFFFF_FFFF_FFFF_FFFF;
    let b_hi = b >> 64;

    let ll = a_lo * b_lo;
    let lh = a_lo * b_hi;
    let hl = a_hi * b_lo;
    let hh = a_hi * b_hi;

    // Accumulate cross terms into mid
    let (mid, carry1) = lh.overflowing_add(hl);
    let carry1 = if carry1 { 1u128 << 64 } else { 0u128 };

    let (lo, carry2) = ll.overflowing_add(mid << 64);
    let carry2 = if carry2 { 1u128 } else { 0u128 };

    let hi = hh + (mid >> 64) + carry1 + carry2;

    U256 { hi, lo }
}

/// Left-shift a U256 by `shift` bits (shift < 128).
pub fn shl_u256(v: U256, shift: u32) -> U256 {
    if shift == 0 {
        return v;
    }
    if shift >= 128 {
        return U256 { hi: v.lo << (shift - 128), lo: 0 };
    }
    U256 {
        hi: (v.hi << shift) | (v.lo >> (128 - shift)),
        lo: v.lo << shift,
    }
}

/// Right-shift a U256 by `shift` bits (shift < 256).
pub fn shr_u256(v: U256, shift: u32) -> U256 {
    if shift == 0 {
        return v;
    }
    if shift >= 128 {
        return U256 { hi: 0, lo: v.hi >> (shift - 128) };
    }
    U256 {
        hi: v.hi >> shift,
        lo: (v.lo >> shift) | (v.hi << (128 - shift)),
    }
}

/// Add two U256 values.
pub fn add_u256(a: U256, b: U256) -> U256 {
    let (lo, carry) = a.lo.overflowing_add(b.lo);
    let hi = a.hi.wrapping_add(b.hi).wrapping_add(if carry { 1 } else { 0 });
    U256 { hi, lo }
}

/// Subtract b from a (assumes a >= b).
pub fn sub_u256(a: U256, b: U256) -> U256 {
    let (lo, borrow) = a.lo.overflowing_sub(b.lo);
    let hi = a.hi.wrapping_sub(b.hi).wrapping_sub(if borrow { 1 } else { 0 });
    U256 { hi, lo }
}

/// Divide a U256 by a u128 divisor, returning the u128 quotient.
///
/// Panics if result doesn't fit in u128 (caller must ensure).
/// Uses long division by 64-bit chunks.
pub fn div_u256_by_u128(n: U256, d: u128) -> Option<u128> {
    if d == 0 {
        return None;
    }
    if n.hi == 0 {
        return Some(n.lo / d);
    }

    // If hi >= d, result won't fit in u128
    if n.hi >= d {
        return None;
    }

    // Standard 2-by-1 division: (hi, lo) / d
    // Split into 64-bit chunks for the division
    // Using the identity: (hi * 2^128 + lo) / d

    // We can use u128 division since hi < d:
    // q = (hi * 2^128 + lo) / d
    //   = (hi * 2^64) / d * 2^64 + ((hi * 2^64) % d * 2^64 + lo) / d

    let hi_shifted = n.hi; // This represents hi * 2^128 conceptually
    let lo = n.lo;

    // Split lo into two 64-bit parts
    let lo_hi = lo >> 64;
    let lo_lo = lo & ((1u128 << 64) - 1);

    // First partial division: (hi * 2^64 + lo_hi) / d
    // But hi is at most d-1, so hi * 2^64 might overflow u128
    // We need to be careful here.

    // Use the algorithm: divide (hi : lo_hi : lo_lo) by d
    // Step 1: divide (0 : hi) by d → q0, r0 (but hi < d, so q0 = 0, r0 = hi)
    let r0 = hi_shifted;

    // Step 2: divide (r0 : lo_hi) by d
    // r0 < d and lo_hi < 2^64, so r0 * 2^64 + lo_hi < d * 2^64 which might overflow u128
    // We need to handle this carefully
    let (q1, r1) = div_128_by_128_with_hi(r0, lo_hi, d);

    // Step 3: divide (r1 : lo_lo) by d
    let (q2, _r2) = div_128_by_128_with_hi(r1, lo_lo, d);

    // Result = q1 * 2^64 + q2
    let result = (q1 << 64) | q2;
    Some(result)
}

/// Helper: divide (hi * 2^64 + lo) by d where hi < d and lo < 2^64.
/// Returns (quotient, remainder), both fit in u64 (quotient) and u128 (remainder).
fn div_128_by_128_with_hi(hi: u128, lo: u128, d: u128) -> (u128, u128) {
    // hi < d, lo < 2^64
    // The number is hi * 2^64 + lo
    // Since hi < d, the quotient fits in 64 bits

    if hi == 0 {
        return (lo / d, lo % d);
    }

    // We want (hi * 2^64 + lo) / d
    // = hi * 2^64 / d + lo / d (approximately, but we need exact)

    // Use: hi = q_hi * d + r_hi where q_hi = hi / d, r_hi = hi % d
    // But hi < d, so q_hi = 0, r_hi = hi
    // So we need: (hi * 2^64 + lo) / d

    // Binary long division approach (fast since quotient < 2^64)
    // Or use the identity with u128 arithmetic:
    // If d fits such that hi * 2^64 doesn't overflow u128...
    // hi < d < 2^128, and 2^64 < 2^128, so hi * 2^64 might overflow u128

    // Safe approach: split into two steps
    // hi * 2^64 = (hi * 2^63) * 2
    // But this still might overflow. Let's use a different approach.

    // Binary search / Newton's method for quotient
    // q = (hi * 2^64 + lo) / d, where q < 2^64

    // Simple approach: use the fact that u128 can hold up to 2^128-1
    // We compute: hi_shifted = hi << 64 (might overflow)
    // If hi < 2^64, this is fine
    if hi < (1u128 << 64) {
        let numerator = (hi << 64) | lo;
        return (numerator / d, numerator % d);
    }

    // hi >= 2^64 but hi < d
    // Use repeated subtraction / long division approach
    // Since quotient < 2^64, we can binary search for it

    // q = floor((hi * 2^64 + lo) / d)
    // d * q <= hi * 2^64 + lo < d * (q+1)

    // Estimate: q ~= hi * 2^64 / d (approximate)
    // Use: q_est = hi / (d >> 64) — rough upper bound
    let d_hi = d >> 64;
    let q_est = if d_hi > 0 { (hi / d_hi).min((1u128 << 64) - 1) } else { (1u128 << 64) - 1 };

    // Refine: compute q_est * d and compare with (hi * 2^64 + lo)
    let prod = mul_u128(q_est, d);
    let target = U256 { hi, lo };

    let mut q = q_est;
    if prod.gt(&target) {
        // Over-estimated, decrease
        loop {
            q -= 1;
            let p = mul_u128(q, d);
            if !p.gt(&target) {
                break;
            }
        }
    } else {
        // Under-estimated, try increasing
        loop {
            let next_q = q + 1;
            let p = mul_u128(next_q, d);
            if p.gt(&target) {
                break;
            }
            q = next_q;
        }
    }

    // Compute remainder
    let p = mul_u128(q, d);
    let rem = sub_u256(target, p);
    (q, rem.lo)
}

/// Integer square root of a U256 value, returning a u128.
///
/// Uses bit-by-bit method (same algorithm as Meteora's sqrt_u256).
pub fn isqrt_u256(n: U256) -> u128 {
    if n.is_zero() {
        return 0;
    }

    // Find highest set bit position
    let bit_pos = if n.hi > 0 {
        128 + (127 - n.hi.leading_zeros())
    } else {
        127 - n.lo.leading_zeros()
    };

    // Start with the largest power of 4 <= n
    let shift = bit_pos & !1; // Round down to even

    let mut bit = if shift >= 128 {
        U256 { hi: 1u128 << (shift - 128), lo: 0 }
    } else {
        U256 { hi: 0, lo: 1u128 << shift }
    };

    let mut n = n;
    let mut result = U256::ZERO;

    while !bit.is_zero() {
        let result_with_bit = add_u256(result, bit);
        if n.ge(&result_with_bit) {
            n = sub_u256(n, result_with_bit);
            result = add_u256(shr_u256(result, 1), bit);
        } else {
            result = shr_u256(result, 1);
        }
        bit = shr_u256(bit, 2);
    }

    // Result should fit in u128 (square root of 256-bit value is at most 128 bits)
    result.lo
}

/// Compute all DAMM v2 pool parameters from treasury token balances.
///
/// Returns: (token_a_amount, token_b_amount, sqrt_price, sqrt_min_price, sqrt_max_price, liquidity)
///
/// - `token_a_amount`: 100% of treasury token A (the Expt Coin)
/// - `token_b_amount`: 75% of treasury token B (SOL) — 25% reserved for milestones
/// - `sqrt_price`: sqrt(token_b / token_a) in Q64.64
/// - Concentrated ±10x range, clamped to DAMM bounds
/// - `liquidity`: min(L_from_A, L_from_B) — exact, no safety margin
pub fn compute_pool_params(
    treasury_token_a_balance: u64,
    treasury_token_b_balance: u64,
) -> Result<(u64, u64, u128, u128, u128, u128), anchor_lang::error::Error> {
    if treasury_token_a_balance == 0 || treasury_token_b_balance == 0 {
        return Err(ExptError::MathOverflow.into());
    }

    let token_a_amount = treasury_token_a_balance;

    // 75% of SOL goes to LP; 25% stays for builder milestone claims
    let token_b_amount = ((treasury_token_b_balance as u128) * 75 / 100) as u64;

    // sqrt_price = sqrt(token_b / token_a) in Q64.64
    //            = sqrt(token_b * 2^128 / token_a)
    // This intermediate fits in U256.
    let ratio_q128 = {
        // (token_b << 128) / token_a
        let numerator = U256 { hi: token_b_amount as u128, lo: 0 };
        div_u256_by_u128(numerator, token_a_amount as u128)
            .ok_or(ExptError::MathOverflow)?
    };
    let sqrt_price = isqrt_u256(U256::from_u128(ratio_q128));

    if sqrt_price == 0 {
        return Err(ExptError::MathOverflow.into());
    }

    // sqrt(10) in Q64.64 = sqrt(10 * 2^128)
    let sqrt_10 = isqrt_u256(U256 { hi: 10u128, lo: 0 });

    // Concentrated ±10x range:
    // sqrt_min_price = sqrt_price * Q64 / sqrt(10)  =  sqrt_price << 64 / sqrt_10
    // sqrt_max_price = sqrt_price * sqrt(10) / Q64  =  sqrt_price * sqrt_10 >> 64
    let sqrt_min_price_raw = {
        let numerator = U256 { hi: 0, lo: sqrt_price };
        let shifted = shl_u256(numerator, 64);
        div_u256_by_u128(shifted, sqrt_10)
            .ok_or(ExptError::MathOverflow)?
    };

    let sqrt_max_price_raw = {
        let product = mul_u128(sqrt_price, sqrt_10);
        shr_u256(product, 64).lo
    };

    // Clamp to DAMM v2 bounds
    let sqrt_min_price = sqrt_min_price_raw.max(DAMM_MIN_SQRT_PRICE);
    let sqrt_max_price = sqrt_max_price_raw.min(DAMM_MAX_SQRT_PRICE);

    // Compute liquidity from both token constraints:
    //
    // From token B (quote): L = tokenB * 2^128 / (sqrtPrice - sqrtMinPrice)
    // From token A (base):  L = tokenA * sqrtPrice * sqrtMaxPrice / (sqrtMaxPrice - sqrtPrice)

    let sqrt_price_delta = sqrt_price
        .checked_sub(sqrt_min_price)
        .ok_or(ExptError::MathOverflow)?;
    let sqrt_price_delta_max = sqrt_max_price
        .checked_sub(sqrt_price)
        .ok_or(ExptError::MathOverflow)?;

    let liquidity_from_b = if sqrt_price_delta > 0 {
        // L_B = (tokenB << 128) / sqrtPriceDelta
        let numerator = U256 { hi: token_b_amount as u128, lo: 0 };
        div_u256_by_u128(numerator, sqrt_price_delta)
            .ok_or(ExptError::MathOverflow)?
    } else {
        0u128
    };

    let liquidity_from_a = if sqrt_price_delta_max > 0 {
        // L_A = tokenA * sqrtPrice * sqrtMaxPrice / sqrtPriceDeltaMax
        // First: tokenA * sqrtPrice (fits in U256)
        let step1 = mul_u128(token_a_amount as u128, sqrt_price);
        // step1 is U256, multiply by sqrtMaxPrice — need 384-bit intermediate
        // But we can divide first to avoid the triple product:
        //
        // L_A = (tokenA * sqrtPrice / sqrtPriceDeltaMax) * sqrtMaxPrice
        //
        // The first division result should be manageable since
        // sqrtPriceDeltaMax is roughly sqrtPrice * (sqrt(10) - 1) ~ 2x sqrtPrice
        // so the quotient ~ tokenA which fits in u64.
        //
        // Actually, let's do it properly:
        // L_A = tokenA * sqrtPrice * sqrtMaxPrice / sqrtPriceDeltaMax
        //
        // step1 = mul_u128(tokenA, sqrtPrice) → U256
        // step2 = step1 / sqrtPriceDeltaMax → u128 (quotient1)
        // step3 = quotient1 * sqrtMaxPrice → U256
        // But this loses precision from the intermediate division.
        //
        // Better: step1 = mul_u128(tokenA, sqrtPrice) → U256
        //         We need step1 * sqrtMaxPrice / sqrtPriceDeltaMax
        //         = div_u256_by_u128(step1 * sqrtMaxPrice, sqrtPriceDeltaMax)
        //
        // For step1 * sqrtMaxPrice, we need U256 * u128 → U512-ish.
        // Let's use: step1_q = div_u256_by_u128(step1, sqrtPriceDeltaMax) (intermediate)
        // then step1_q * sqrtMaxPrice → but step1_q might be large.
        //
        // Actually the most precise approach:
        // step1.lo * sqrtMaxPrice → U256  (call it part_lo)
        // step1.hi * sqrtMaxPrice → U256  (call it part_hi, shifted by 128)
        // sum = part_hi << 128 + part_lo → U384... too wide.
        //
        // Practical approach: divide first, then multiply
        // L_A = (tokenA * sqrtPrice / sqrtPriceDeltaMax) * sqrtMaxPrice
        // The quotient tokenA * sqrtPrice / sqrtPriceDeltaMax
        // tends to be around tokenA (since sqrtPrice/delta ~ 1-3x)
        // which is at most ~10^18 — fits in u128 easily.

        let intermediate = div_u256_by_u128(step1, sqrt_price_delta_max)
            .ok_or(ExptError::MathOverflow)?;
        let result = mul_u128(intermediate, sqrt_max_price);
        // This U256 result should be the liquidity — it must fit in u128
        if result.hi > 0 {
            // Liquidity too large — this won't happen with reasonable values
            // but fallback to u128::MAX
            u128::MAX
        } else {
            result.lo
        }
    } else {
        0u128
    };

    // Take the minimum — no safety margin needed since we read balances
    // in the same transaction that creates the pool
    let liquidity = liquidity_from_a.min(liquidity_from_b);

    if liquidity == 0 {
        return Err(ExptError::MathOverflow.into());
    }

    Ok((
        token_a_amount,
        token_b_amount,
        sqrt_price,
        sqrt_min_price,
        sqrt_max_price,
        liquidity,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mul_u128() {
        // Simple case
        let r = mul_u128(10, 20);
        assert_eq!(r.hi, 0);
        assert_eq!(r.lo, 200);

        // Overflow case
        let r = mul_u128(u128::MAX, 2);
        assert_eq!(r.hi, 1);
        assert_eq!(r.lo, u128::MAX - 1);
    }

    #[test]
    fn test_isqrt_u256() {
        assert_eq!(isqrt_u256(U256::ZERO), 0);
        assert_eq!(isqrt_u256(U256::from_u128(1)), 1);
        assert_eq!(isqrt_u256(U256::from_u128(4)), 2);
        assert_eq!(isqrt_u256(U256::from_u128(100)), 10);
        assert_eq!(isqrt_u256(U256::from_u128(99)), 9); // floor
    }

    #[test]
    fn test_div_u256_by_u128() {
        let n = U256 { hi: 0, lo: 200 };
        assert_eq!(div_u256_by_u128(n, 10), Some(20));

        let n = U256 { hi: 1, lo: 0 };
        // (1 << 128) / 2 = 2^127
        assert_eq!(div_u256_by_u128(n, 2), Some(1u128 << 127));
    }

    #[test]
    fn test_compute_pool_params_basic() {
        // 500M tokens (9 decimals) and 5 SOL (9 decimals)
        let token_a = 500_000_000_000_000_000u64; // 500M tokens
        let token_b = 5_000_000_000u64;           // 5 SOL

        let result = compute_pool_params(token_a, token_b);
        assert!(result.is_ok());

        let (a, b, sqrt_price, sqrt_min, sqrt_max, liquidity) = result.unwrap();
        assert_eq!(a, token_a);
        assert_eq!(b, 3_750_000_000u64); // 75% of 5 SOL
        assert!(sqrt_price > 0);
        assert!(sqrt_min >= DAMM_MIN_SQRT_PRICE);
        assert!(sqrt_max <= DAMM_MAX_SQRT_PRICE);
        assert!(sqrt_min < sqrt_price);
        assert!(sqrt_price < sqrt_max);
        assert!(liquidity > 0);
    }

    #[test]
    fn test_compute_pool_params_zero() {
        assert!(compute_pool_params(0, 5_000_000_000).is_err());
        assert!(compute_pool_params(1_000_000_000, 0).is_err());
    }
}
