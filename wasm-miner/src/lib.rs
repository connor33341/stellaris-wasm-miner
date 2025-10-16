use wasm_bindgen::prelude::*;
use sha2::{Sha256, Digest};
use std::cmp::min;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

/// Convert address string to bytes, supporting both hex and base58 formats
fn string_to_bytes(address: &str) -> Result<Vec<u8>, String> {
    // Try hex first
    if let Ok(bytes) = hex::decode(address) {
        return Ok(bytes);
    }
    
    // Try base58
    match bs58::decode(address).into_vec() {
        Ok(bytes) => Ok(bytes),
        Err(_) => Err("Invalid address format".to_string())
    }
}

/// Calculate SHA256 hash of data
fn sha256(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

/// Check if a block hash meets the difficulty requirement
fn check_difficulty(hash_hex: &str, chunk: &str, difficulty: f64) -> bool {
    if !hash_hex.starts_with(chunk) {
        return false;
    }
    
    let decimal = difficulty % 1.0;
    if decimal > 0.0 {
        let charset = "0123456789abcdef";
        let count = (16.0 * (1.0 - decimal)).ceil() as usize;
        let valid_chars = &charset[..count];
        let idifficulty = difficulty as usize;
        
        if let Some(char_at_pos) = hash_hex.chars().nth(idifficulty) {
            return valid_chars.contains(char_at_pos);
        }
        return false;
    }
    
    true
}

#[wasm_bindgen]
pub struct MinerResult {
    found: bool,
    nonce: u32,
    hash: String,
    hashes_computed: u32,
    best_nonce: u32,
    best_hash: String,
}

#[wasm_bindgen]
impl MinerResult {
    #[wasm_bindgen(getter)]
    pub fn found(&self) -> bool {
        self.found
    }
    
    #[wasm_bindgen(getter)]
    pub fn nonce(&self) -> u32 {
        self.nonce
    }
    
    #[wasm_bindgen(getter)]
    pub fn hash(&self) -> String {
        self.hash.clone()
    }
    
    #[wasm_bindgen(getter)]
    pub fn hashes_computed(&self) -> u32 {
        self.hashes_computed
    }
    
    #[wasm_bindgen(getter)]
    pub fn best_nonce(&self) -> u32 {
        self.best_nonce
    }
    
    #[wasm_bindgen(getter)]
    pub fn best_hash(&self) -> String {
        self.best_hash.clone()
    }
    
    #[wasm_bindgen(getter)]
    pub fn block_content_hex(&self) -> String {
        "".to_string() // Will be computed in JS when needed
    }
}

#[wasm_bindgen]
pub fn mine_range(
    previous_hash: &str,
    pool_address: &str,
    merkle_root: &str,
    timestamp: u32,
    difficulty: f64,
    nonce_start: u32,
    nonce_end: u32,
    max_hashes: u32,
) -> Result<MinerResult, JsValue> {
    // Parse address
    let address_bytes = string_to_bytes(pool_address)
        .map_err(|e| JsValue::from_str(&e))?;
    
    // Calculate difficulty chunk
    let chunk_len = difficulty as usize;
    let chunk = &previous_hash[previous_hash.len().saturating_sub(chunk_len)..];
    
    // Build block prefix (matching Python implementation)
    let mut prefix = Vec::new();
    
    // Add version byte if compressed address (33 bytes)
    if address_bytes.len() == 33 {
        prefix.push(2u8);
    }
    
    // Add previous_hash
    prefix.extend_from_slice(&hex::decode(previous_hash)
        .map_err(|_| JsValue::from_str("Invalid previous_hash"))?);
    
    // Add address
    prefix.extend_from_slice(&address_bytes);
    
    // Add merkle_root
    prefix.extend_from_slice(&hex::decode(merkle_root)
        .map_err(|_| JsValue::from_str("Invalid merkle_root"))?);
    
    // Add timestamp (4 bytes, little endian)
    prefix.extend_from_slice(&timestamp.to_le_bytes());
    
    // Add difficulty (2 bytes, little endian, scaled by 10)
    let difficulty_scaled = (difficulty * 10.0) as u16;
    prefix.extend_from_slice(&difficulty_scaled.to_le_bytes());
    
    // Mining loop
    let mut best_hash = "f".repeat(64);
    let mut best_nonce = nonce_start;
    let mut hashes_computed = 0u32;
    
    let end = min(nonce_end, nonce_start.saturating_add(max_hashes));
    
    for nonce in nonce_start..end {
        // Build block content with nonce (4 bytes, little endian)
        let mut block_content = prefix.clone();
        block_content.extend_from_slice(&nonce.to_le_bytes());
        
        // Calculate hash
        let hash_bytes = sha256(&block_content);
        let hash_hex = hex::encode(&hash_bytes);
        
        hashes_computed += 1;
        
        // Track best hash
        if hash_hex < best_hash {
            best_hash = hash_hex.clone();
            best_nonce = nonce;
        }
        
        // Check if valid block
        if check_difficulty(&hash_hex, chunk, difficulty) {
            return Ok(MinerResult {
                found: true,
                nonce,
                hash: hash_hex,
                hashes_computed,
                best_nonce,
                best_hash,
            });
        }
    }
    
    // No block found
    Ok(MinerResult {
        found: false,
        nonce: best_nonce,
        hash: best_hash.clone(),
        hashes_computed,
        best_nonce,
        best_hash,
    })
}

#[wasm_bindgen]
pub fn build_block_content(
    previous_hash: &str,
    pool_address: &str,
    merkle_root: &str,
    timestamp: u32,
    difficulty: f64,
    nonce: u32,
) -> Result<String, JsValue> {
    // Parse address
    let address_bytes = string_to_bytes(pool_address)
        .map_err(|e| JsValue::from_str(&e))?;
    
    // Build block content
    let mut block_content = Vec::new();
    
    // Add version byte if compressed address (33 bytes)
    if address_bytes.len() == 33 {
        block_content.push(2u8);
    }
    
    // Add previous_hash
    block_content.extend_from_slice(&hex::decode(previous_hash)
        .map_err(|_| JsValue::from_str("Invalid previous_hash"))?);
    
    // Add address
    block_content.extend_from_slice(&address_bytes);
    
    // Add merkle_root
    block_content.extend_from_slice(&hex::decode(merkle_root)
        .map_err(|_| JsValue::from_str("Invalid merkle_root"))?);
    
    // Add timestamp (4 bytes, little endian)
    block_content.extend_from_slice(&timestamp.to_le_bytes());
    
    // Add difficulty (2 bytes, little endian, scaled by 10)
    let difficulty_scaled = (difficulty * 10.0) as u16;
    block_content.extend_from_slice(&difficulty_scaled.to_le_bytes());
    
    // Add nonce (4 bytes, little endian)
    block_content.extend_from_slice(&nonce.to_le_bytes());
    
    Ok(hex::encode(block_content))
}

#[wasm_bindgen(start)]
pub fn main() {
    log("Stellaris WASM Miner initialized");
}
