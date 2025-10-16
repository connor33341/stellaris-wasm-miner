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
        this.workers = [];
        this.poolShares = 1;
        this.workersPerShare = 1;
        this.shares = []; // Track active shares
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
        this.workersReady = 0;
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

    async startMining(poolUrl, walletAddress, workerName = null, poolShares = 1, workersPerShare = 1) {
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
        this.poolShares = poolShares;
        this.workersPerShare = workersPerShare;
        this.mining = true;
        this.stats.startTime = Date.now();
        this.stats.totalHashes = 0;
        this.stats.sharesSubmitted = 0;
        this.stats.blocksFound = 0;
        this.stats.workUnits = 0;

        const totalWorkers = poolShares * workersPerShare;

        console.log(`🚀 Starting mining`);
        console.log(`   Pool: ${this.poolUrl}`);
        console.log(`   Wallet: ${this.walletAddress}`);
        console.log(`   Worker: ${this.workerName}`);
        console.log(`   Pool Shares: ${this.poolShares}`);
        console.log(`   Workers per Share: ${this.workersPerShare}`);
        console.log(`   Total Workers: ${totalWorkers}`);

        // Register with pool
        if (!await this.register()) {
            this.mining = false;
            return;
        }

        // Initialize workers
        await this.initWorkers(totalWorkers);

        this.updateStatus('Mining...');
        this.mineLoop();
    }

    async initWorkers(totalWorkers) {
        console.log(`🔧 Initializing ${totalWorkers} worker thread(s)...`);
        this.workers = [];
        this.workersReady = 0;

        for (let i = 0; i < totalWorkers; i++) {
            const worker = new Worker('./mining-worker.js', { type: 'module' });
            
            worker.onmessage = (e) => this.handleWorkerMessage(e, i);
            worker.onerror = (error) => {
                console.error(`❌ Worker ${i} error:`, error);
            };

            this.workers.push({
                worker: worker,
                id: i,
                shareId: null, // Which share this worker is assigned to
                mining: false,
                stats: {
                    hashes: 0,
                    lastUpdate: Date.now()
                }
            });

            // Initialize the worker with WASM module
            worker.postMessage({
                type: 'init',
                data: {
                    wasmPath: './pkg/stellaris_wasm_miner.js',
                    workerId: i
                }
            });
        }

        // Wait for all workers to initialize
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (this.workersReady >= totalWorkers) {
                    clearInterval(checkInterval);
                    console.log(`✅ All ${totalWorkers} worker(s) ready`);
                    resolve();
                }
            }, 100);
        });
    }

    handleWorkerMessage(e, workerId) {
        const { type, result, error } = e.data;

        switch (type) {
            case 'initialized':
                this.workersReady++;
                break;

            case 'result':
                this.handleMiningResult(workerId, result);
                break;

            case 'range_complete':
                this.workers[workerId].mining = false;
                break;

            case 'error':
                console.error(`❌ Worker ${workerId} error:`, error);
                this.workers[workerId].mining = false;
                break;
        }
    }

    async handleMiningResult(workerId, result) {
        const worker = this.workers[workerId];
        
        // Update stats
        this.stats.totalHashes += result.hashes_computed;
        worker.stats.hashes += result.hashes_computed;
        worker.stats.lastUpdate = Date.now();

        // Update hashrate
        this.updateHashrateFromWorkers();

        // Find which share this worker belongs to
        const shareId = worker.shareId;
        const share = this.shares[shareId];
        
        if (!share) return;

        // Update best hash for this share
        if (!share.bestHash || result.best_hash < share.bestHash) {
            share.bestHash = result.best_hash;
            share.bestNonce = result.best_nonce;
        }
        share.totalHashes += result.hashes_computed;

        // Check if block found
        if (result.found) {
            console.log('🎉🎉🎉 VALID BLOCK FOUND! 🎉🎉🎉');
            console.log(`   Share: ${shareId}`);
            console.log(`   Worker: ${workerId}`);
            console.log(`   Nonce: ${result.nonce.toLocaleString()}`);
            console.log(`   Hash: ${result.hash}`);
            
            // Stop all workers for this share
            this.stopShareWorkers(shareId);

            if (share) {
                // Build block content
                const blockContentHex = this.wasmModule.build_block_content(
                    share.previous_hash,
                    share.pool_address,
                    share.merkle_root,
                    share.timestamp,
                    share.difficulty,
                    result.nonce
                );

                // Submit block
                const response = await this.submitShare(
                    share.block_height,
                    result.nonce,
                    blockContentHex,
                    result.hash,
                    true
                );

                if (response && response.block_found) {
                    this.stats.blocksFound++;
                    this.updateStatus(`🎉 BLOCK FOUND! Total: ${this.stats.blocksFound}`);
                }

                // Mark share as complete (block found)
                share.blockFound = true;
                share.complete = true;
            }
        }
    }

    stopShareWorkers(shareId) {
        for (const worker of this.workers) {
            if (worker.shareId === shareId && worker.mining) {
                worker.worker.postMessage({ type: 'stop' });
                worker.mining = false;
            }
        }
    }

    updateHashrateFromWorkers() {
        const now = Date.now();
        let totalHashrate = 0;

        for (const worker of this.workers) {
            const elapsed = (now - worker.stats.lastUpdate) / 1000;
            if (elapsed > 0 && worker.stats.hashes > 0) {
                const hashrate = worker.stats.hashes / elapsed;
                totalHashrate += hashrate;
            }
        }

        if (totalHashrate > 0) {
            this.hashrateSamples.push(totalHashrate);
            if (this.hashrateSamples.length > this.maxSamples) {
                this.hashrateSamples.shift();
            }
            
            const sum = this.hashrateSamples.reduce((a, b) => a + b, 0);
            this.stats.hashrate = sum / this.hashrateSamples.length;
        }
    }

    stopAllWorkers() {
        for (const worker of this.workers) {
            if (worker.mining) {
                worker.worker.postMessage({ type: 'stop' });
                worker.mining = false;
            }
        }
    }

    stopMining() {
        this.mining = false;
        this.stopAllWorkers();
        
        // Terminate all workers
        for (const worker of this.workers) {
            worker.worker.terminate();
        }
        this.workers = [];
        
        this.updateStatus('Stopped');
        console.log('⚠️ Mining stopped');
    }

    async mineLoop() {
        const chunkSize = 50000; // Each worker processes 50k hashes at a time

        while (this.mining) {
            try {
                // Fetch work for all pool shares
                console.log(`🔄 Fetching ${this.poolShares} work unit(s) from pool...`);
                const workUnits = [];
                
                for (let i = 0; i < this.poolShares; i++) {
                    const work = await this.getWork();
                    if (work && work.block_height) {
                        workUnits.push(work);
                    } else {
                        console.log(`⚠️ Could not fetch work unit ${i + 1}/${this.poolShares}`);
                    }
                }

                if (workUnits.length === 0) {
                    console.log('⚠️ No work available, waiting...');
                    this.updateStatus('No work available, waiting...');
                    await this.sleep(5000);
                    continue;
                }

                console.log(`✅ Got ${workUnits.length} work unit(s)`);
                
                // Initialize shares
                this.shares = workUnits.map((work, idx) => ({
                    id: idx,
                    block_height: work.block_height,
                    difficulty: work.difficulty,
                    previous_hash: work.previous_hash,
                    merkle_root: work.merkle_root,
                    timestamp: work.timestamp,
                    nonce_start: work.nonce_start,
                    nonce_end: work.nonce_end,
                    pool_address: work.pool_address,
                    bestHash: 'f'.repeat(64),
                    bestNonce: work.nonce_start,
                    totalHashes: 0,
                    startTime: Date.now(),
                    complete: false,
                    blockFound: false
                }));

                // Log all shares
                for (const share of this.shares) {
                    this.stats.currentBlock = share.block_height;
                    console.log(`📦 Share ${share.id}: Block #${share.block_height}, difficulty ${share.difficulty}`);
                    console.log(`   Nonce range: ${share.nonce_start.toLocaleString()} - ${share.nonce_end.toLocaleString()}`);
                }

                // Assign workers to shares and start mining
                const allPromises = [];
                let workerIdx = 0;

                for (let shareIdx = 0; shareIdx < this.shares.length; shareIdx++) {
                    const share = this.shares[shareIdx];
                    const shareWorkers = [];
                    
                    // Assign workersPerShare to this share
                    for (let i = 0; i < this.workersPerShare && workerIdx < this.workers.length; i++, workerIdx++) {
                        shareWorkers.push(this.workers[workerIdx]);
                        this.workers[workerIdx].shareId = shareIdx;
                        this.workers[workerIdx].stats.hashes = 0;
                        this.workers[workerIdx].stats.lastUpdate = Date.now();
                    }

                    console.log(`   Share ${shareIdx}: ${shareWorkers.length} worker(s) (Worker IDs: ${shareWorkers.map(w => w.id).join(', ')})`);

                    // Divide nonce range among workers for this share
                    const totalRange = share.nonce_end - share.nonce_start;
                    const rangePerWorker = Math.ceil(totalRange / shareWorkers.length);

                    for (let i = 0; i < shareWorkers.length; i++) {
                        const worker = shareWorkers[i];
                        const workerStart = share.nonce_start + (i * rangePerWorker);
                        const workerEnd = Math.min(workerStart + rangePerWorker, share.nonce_end);
                        
                        if (workerStart >= share.nonce_end) break;

                        worker.mining = true;
                        worker.worker.postMessage({
                            type: 'mine',
                            data: {
                                previous_hash: share.previous_hash,
                                pool_address: share.pool_address,
                                merkle_root: share.merkle_root,
                                timestamp: share.timestamp,
                                difficulty: share.difficulty,
                                nonce_start: workerStart,
                                nonce_end: workerEnd,
                                chunk_size: chunkSize
                            }
                        });

                        // Create promise for this worker
                        allPromises.push(new Promise((resolve) => {
                            const checkInterval = setInterval(() => {
                                if (!worker.mining || !this.mining) {
                                    clearInterval(checkInterval);
                                    resolve();
                                }
                            }, 100);
                        }));
                    }
                }

                // Update hashrate and status periodically
                const hashrateInterval = setInterval(() => {
                    if (!this.mining) {
                        clearInterval(hashrateInterval);
                        return;
                    }
                    this.updateHashrateFromWorkers();
                    const activeShares = this.shares.filter(s => !s.complete).length;
                    this.updateStatus(`Mining ${activeShares} share(s) with ${this.poolShares * this.workersPerShare} workers`);
                }, 1000);

                // Wait for all workers to complete
                await Promise.all(allPromises);
                clearInterval(hashrateInterval);

                // Process completed shares
                for (const share of this.shares) {
                    if (share.complete) {
                        if (share.blockFound) {
                            console.log(`✅ Share ${share.id}: Block found!`);
                        }
                        continue;
                    }

                    // Check if all workers for this share completed
                    const shareWorkers = this.workers.filter(w => w.shareId === share.id);
                    const allComplete = shareWorkers.every(w => !w.mining);

                    if (allComplete) {
                        console.log(`📊 Share ${share.id}: Submitting work proof (${share.totalHashes.toLocaleString()} hashes)`);
                        
                        const response = await this.submitWorkProof(
                            share.block_height,
                            share.nonce_start,
                            share.nonce_end,
                            share.bestNonce,
                            share.bestHash,
                            share.totalHashes
                        );

                        if (response && response.success) {
                            this.stats.sharesSubmitted++;
                            const workUnits = response.work_units || 0;
                            this.stats.workUnits += workUnits;
                            console.log(`✅ Share ${share.id}: Work proof accepted (${workUnits} work units)`);
                            this.updateStatus(`${this.stats.sharesSubmitted} work proofs accepted`);
                        } else {
                            console.log(`❌ Share ${share.id}: Work proof rejected`);
                        }

                        share.complete = true;
                    }
                }

                // Reset shares
                this.shares = [];

                // Small delay before next round
                await this.sleep(100);

            } catch (error) {
                console.error('❌ Mining loop error:', error);
                this.updateStatus('Error: ' + error.message);
                await this.sleep(5000);
            }
        }
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
