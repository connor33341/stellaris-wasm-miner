/**
 * Stellaris WASM Miner - JavaScript Wrapper
 * Handles pool communication and coordinates the WASM mining module
 */

class StellarisMiner {
    constructor() {
        this.wasmModule = null;
        this.mining = false;
        this.poolUrl = '';
        this.walletAddress = '';
        this.workerName = '';
        this.minerId = '';
        this.stats = {
            hashrate: 0,
            totalHashes: 0,
            sharesSubmitted: 0,
            blocksFound: 0,
            startTime: null,
            lastUpdate: null,
            currentBlock: null,
            workUnits: 0
        };
        this.hashrateSamples = [];
        this.maxSamples = 10;
    }

    async init(wasmPath = './pkg/stellaris_wasm_miner.js') {
        try {
            const wasm = await import(wasmPath);
            await wasm.default();
            this.wasmModule = wasm;
            console.log('✅ WASM module loaded successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to load WASM module:', error);
            throw error;
        }
    }

    generateWorkerName() {
        return `wasm-${Math.random().toString(36).substr(2, 8)}`;
    }

    async register() {
        try {
            const response = await fetch(`${this.poolUrl}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    miner_id: this.minerId,
                    wallet_address: this.walletAddress,
                    worker_name: this.workerName
                })
            });

            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ Registered with pool: ${this.minerId}`);
                this.updateStatus('Registered with pool');
                return true;
            } else {
                console.error('❌ Registration failed:', result);
                this.updateStatus('Registration failed: ' + (result.error || 'Unknown error'));
                return false;
            }
        } catch (error) {
            console.error('❌ Registration error:', error);
            this.updateStatus('Registration error: ' + error.message);
            return false;
        }
    }

    async getWork() {
        try {
            const response = await fetch(`${this.poolUrl}/api/work`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ miner_id: this.minerId })
            });

            return await response.json();
        } catch (error) {
            console.error('❌ Error getting work:', error);
            return null;
        }
    }

    async submitShare(blockHeight, nonce, blockContentHex, blockHash, isValidBlock = false) {
        try {
            const response = await fetch(`${this.poolUrl}/api/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    miner_id: this.minerId,
                    block_height: blockHeight,
                    nonce: nonce,
                    block_content_hex: blockContentHex,
                    block_hash: blockHash,
                    is_valid_block: isValidBlock
                })
            });

            return await response.json();
        } catch (error) {
            console.error('❌ Error submitting share:', error);
            return null;
        }
    }

    async submitWorkProof(blockHeight, nonceStart, nonceEnd, bestNonce, bestHash, hashesComputed) {
        try {
            const response = await fetch(`${this.poolUrl}/api/work_proof`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    miner_id: this.minerId,
                    block_height: blockHeight,
                    nonce_start: nonceStart,
                    nonce_end: nonceEnd,
                    best_nonce: bestNonce,
                    best_hash: bestHash,
                    hashes_computed: hashesComputed
                })
            });

            return await response.json();
        } catch (error) {
            console.error('❌ Error submitting work proof:', error);
            return null;
        }
    }

    async startMining(poolUrl, walletAddress, workerName = null) {
        if (this.mining) {
            console.log('⚠️ Mining already in progress');
            return;
        }

        if (!this.wasmModule) {
            throw new Error('WASM module not initialized. Call init() first.');
        }

        this.poolUrl = poolUrl.replace(/\/$/, '');
        this.walletAddress = walletAddress;
        this.workerName = workerName || this.generateWorkerName();
        this.minerId = `${walletAddress.substring(0, 12)}_${this.workerName}`;
        this.mining = true;
        this.stats.startTime = Date.now();
        this.stats.totalHashes = 0;
        this.stats.sharesSubmitted = 0;
        this.stats.blocksFound = 0;
        this.stats.workUnits = 0;

        console.log(`🚀 Starting mining`);
        console.log(`   Pool: ${this.poolUrl}`);
        console.log(`   Wallet: ${this.walletAddress}`);
        console.log(`   Worker: ${this.workerName}`);

        // Register with pool
        if (!await this.register()) {
            this.mining = false;
            return;
        }

        this.updateStatus('Mining...');
        this.mineLoop();
    }

    stopMining() {
        this.mining = false;
        this.updateStatus('Stopped');
        console.log('⚠️ Mining stopped');
    }

    async mineLoop() {
        const chunkSize = 50000; // Process 50k hashes at a time to keep UI responsive

        while (this.mining) {
            try {
                // Get work from pool
                const work = await this.getWork();
                
                if (!work || !work.block_height) {
                    console.log('⚠️ No work available, waiting...');
                    this.updateStatus('No work available, waiting...');
                    await this.sleep(5000);
                    continue;
                }

                const {
                    block_height,
                    difficulty,
                    previous_hash,
                    merkle_root,
                    timestamp,
                    nonce_start,
                    nonce_end,
                    pool_address
                } = work;

                this.stats.currentBlock = block_height;
                console.log(`⛏️ Mining block #${block_height}, difficulty ${difficulty}`);
                console.log(`   Nonce range: ${nonce_start.toLocaleString()} - ${nonce_end.toLocaleString()}`);
                
                this.updateStatus(`Mining block #${block_height}`);

                // Mine the range in chunks
                let currentNonce = nonce_start;
                let totalHashes = 0;
                let bestNonce = nonce_start;
                let bestHash = 'f'.repeat(64);
                const startTime = Date.now();

                while (currentNonce < nonce_end && this.mining) {
                    const chunkEnd = Math.min(currentNonce + chunkSize, nonce_end);
                    
                    try {
                        // Mine chunk using WASM
                        const result = this.wasmModule.mine_range(
                            previous_hash,
                            pool_address,
                            merkle_root,
                            timestamp,
                            difficulty,
                            currentNonce,
                            chunkEnd,
                            chunkSize
                        );

                        totalHashes += result.hashes_computed;
                        this.stats.totalHashes += result.hashes_computed;

                        // Update best hash
                        if (result.best_hash < bestHash) {
                            bestHash = result.best_hash;
                            bestNonce = result.best_nonce;
                        }

                        // Check if block found
                        if (result.found) {
                            console.log('🎉🎉🎉 VALID BLOCK FOUND! 🎉🎉🎉');
                            console.log(`   Nonce: ${result.nonce.toLocaleString()}`);
                            console.log(`   Hash: ${result.hash}`);
                            
                            // Build block content
                            const blockContentHex = this.wasmModule.build_block_content(
                                previous_hash,
                                pool_address,
                                merkle_root,
                                timestamp,
                                difficulty,
                                result.nonce
                            );

                            // Submit block
                            const response = await this.submitShare(
                                block_height,
                                result.nonce,
                                blockContentHex,
                                result.hash,
                                true
                            );

                            if (response && response.block_found) {
                                this.stats.blocksFound++;
                                this.updateStatus(`🎉 BLOCK FOUND! Total: ${this.stats.blocksFound}`);
                            }

                            break; // Move to next work
                        }

                        // Update hashrate
                        const elapsed = (Date.now() - startTime) / 1000;
                        if (elapsed > 0) {
                            const hashrate = totalHashes / elapsed;
                            this.updateHashrate(hashrate);
                        }

                        currentNonce = chunkEnd;

                        // Small delay to keep UI responsive
                        await this.sleep(1);

                    } catch (error) {
                        console.error('❌ Mining error:', error);
                        break;
                    }
                }

                // Submit work proof if we didn't find a block
                if (this.mining && currentNonce >= nonce_end) {
                    const response = await this.submitWorkProof(
                        block_height,
                        nonce_start,
                        nonce_end,
                        bestNonce,
                        bestHash,
                        totalHashes
                    );

                    if (response && response.success) {
                        this.stats.sharesSubmitted++;
                        const workUnits = response.work_units || 0;
                        this.stats.workUnits += workUnits;
                        console.log(`✅ Work proof accepted (${workUnits} work units this round)`);
                        this.updateStatus(`Work accepted - ${this.stats.sharesSubmitted} shares submitted`);
                    }
                }

            } catch (error) {
                console.error('❌ Mining loop error:', error);
                this.updateStatus('Error: ' + error.message);
                await this.sleep(5000);
            }
        }
    }

    updateHashrate(hashrate) {
        this.hashrateSamples.push(hashrate);
        if (this.hashrateSamples.length > this.maxSamples) {
            this.hashrateSamples.shift();
        }
        
        // Calculate average hashrate
        const sum = this.hashrateSamples.reduce((a, b) => a + b, 0);
        this.stats.hashrate = sum / this.hashrateSamples.length;
        this.stats.lastUpdate = Date.now();
    }

    updateStatus(message) {
        const event = new CustomEvent('miner-status', { 
            detail: { message, stats: this.getStats() }
        });
        document.dispatchEvent(event);
    }

    getStats() {
        const uptime = this.stats.startTime ? 
            Math.floor((Date.now() - this.stats.startTime) / 1000) : 0;
        
        return {
            ...this.stats,
            uptime,
            hashrate: Math.round(this.stats.hashrate),
            mining: this.mining
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use in HTML
window.StellarisMiner = StellarisMiner;
