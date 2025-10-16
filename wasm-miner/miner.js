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
        this.threadCount = 1;
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
        this.currentWork = null;
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

    async startMining(poolUrl, walletAddress, workerName = null, threadCount = 1) {
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
        this.threadCount = threadCount;
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
        console.log(`   Threads: ${this.threadCount}`);

        // Register with pool
        if (!await this.register()) {
            this.mining = false;
            return;
        }

        // Initialize workers
        await this.initWorkers();

        this.updateStatus('Mining...');
        this.mineLoop();
    }

    async initWorkers() {
        console.log(`🔧 Initializing ${this.threadCount} worker thread(s)...`);
        this.workers = [];
        this.workersReady = 0;

        for (let i = 0; i < this.threadCount; i++) {
            const worker = new Worker('./mining-worker.js', { type: 'module' });
            
            worker.onmessage = (e) => this.handleWorkerMessage(e, i);
            worker.onerror = (error) => {
                console.error(`❌ Worker ${i} error:`, error);
            };

            this.workers.push({
                worker: worker,
                id: i,
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
                if (this.workersReady >= this.threadCount) {
                    clearInterval(checkInterval);
                    console.log(`✅ All ${this.threadCount} worker(s) ready`);
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

        // Update best hash for this work unit
        if (this.currentWork) {
            if (!this.currentWork.bestHash || result.best_hash < this.currentWork.bestHash) {
                this.currentWork.bestHash = result.best_hash;
                this.currentWork.bestNonce = result.best_nonce;
            }
            this.currentWork.totalHashes += result.hashes_computed;
        }

        // Check if block found
        if (result.found) {
            console.log('🎉🎉🎉 VALID BLOCK FOUND! 🎉🎉🎉');
            console.log(`   Worker: ${workerId}`);
            console.log(`   Nonce: ${result.nonce.toLocaleString()}`);
            console.log(`   Hash: ${result.hash}`);
            
            // Stop all workers for this round
            this.stopAllWorkers();

            if (this.currentWork) {
                // Build block content
                const blockContentHex = this.wasmModule.build_block_content(
                    this.currentWork.previous_hash,
                    this.currentWork.pool_address,
                    this.currentWork.merkle_root,
                    this.currentWork.timestamp,
                    this.currentWork.difficulty,
                    result.nonce
                );

                // Submit block
                const response = await this.submitShare(
                    this.currentWork.block_height,
                    result.nonce,
                    blockContentHex,
                    result.hash,
                    true
                );

                if (response && response.block_found) {
                    this.stats.blocksFound++;
                    this.updateStatus(`🎉 BLOCK FOUND! Total: ${this.stats.blocksFound}`);
                }

                // Mark that we found a block and clear current work
                // This signals to the main loop not to submit work proof
                this.currentWork = null;
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
                console.log(`   Total range: ${(nonce_end - nonce_start).toLocaleString()} nonces`);
                
                this.updateStatus(`Mining block #${block_height}`);

                // Initialize work tracking
                this.currentWork = {
                    block_height,
                    difficulty,
                    previous_hash,
                    merkle_root,
                    timestamp,
                    nonce_start,
                    nonce_end,
                    pool_address,
                    bestHash: 'f'.repeat(64),
                    bestNonce: nonce_start,
                    totalHashes: 0,
                    startTime: Date.now()
                };

                // Divide the nonce range among workers
                const totalRange = nonce_end - nonce_start;
                const rangePerWorker = Math.ceil(totalRange / this.threadCount);

                // Reset worker stats
                for (const worker of this.workers) {
                    worker.stats.hashes = 0;
                    worker.stats.lastUpdate = Date.now();
                }

                // Start all workers with their assigned ranges
                const workerPromises = [];
                for (let i = 0; i < this.threadCount; i++) {
                    const workerStart = nonce_start + (i * rangePerWorker);
                    const workerEnd = Math.min(workerStart + rangePerWorker, nonce_end);
                    
                    if (workerStart >= nonce_end) break;

                    console.log(`   Worker ${i}: ${workerStart.toLocaleString()} - ${workerEnd.toLocaleString()}`);

                    this.workers[i].mining = true;
                    this.workers[i].worker.postMessage({
                        type: 'mine',
                        data: {
                            previous_hash,
                            pool_address,
                            merkle_root,
                            timestamp,
                            difficulty,
                            nonce_start: workerStart,
                            nonce_end: workerEnd,
                            chunk_size: chunkSize
                        }
                    });

                    // Create a promise that resolves when this worker completes
                    workerPromises.push(new Promise((resolve) => {
                        const checkInterval = setInterval(() => {
                            if (!this.workers[i].mining || !this.mining) {
                                clearInterval(checkInterval);
                                resolve();
                            }
                        }, 100);
                    }));
                }

                // Update hashrate periodically while mining
                const hashrateInterval = setInterval(() => {
                    if (!this.mining) {
                        clearInterval(hashrateInterval);
                        return;
                    }
                    this.updateHashrateFromWorkers();
                    this.updateStatus(`Mining block #${block_height} (${this.threadCount} threads)`);
                }, 1000);

                // Wait for all workers to complete their ranges or find a block
                await Promise.race([
                    Promise.all(workerPromises),
                    this.waitForBlockFound()
                ]);

                clearInterval(hashrateInterval);

                // Check worker completion status
                const allWorkersComplete = this.workers.every(w => !w.mining);
                const workersStillMining = this.workers.filter(w => w.mining).length;
                
                console.log(`📊 Mining round complete:`);
                console.log(`   Workers complete: ${allWorkersComplete ? 'Yes' : `No (${workersStillMining} still mining)`}`);
                console.log(`   Current work exists: ${this.currentWork ? 'Yes' : 'No (block found)'}`);

                // Save current work data before it might be cleared
                const workData = this.currentWork ? {
                    block_height: this.currentWork.block_height,
                    nonce_start,
                    nonce_end,
                    bestNonce: this.currentWork.bestNonce,
                    bestHash: this.currentWork.bestHash,
                    totalHashes: this.currentWork.totalHashes
                } : null;

                // Check if a block was found (currentWork would be null if block found)
                const blockFound = !this.currentWork;

                // Submit work proof if we didn't find a block and all workers completed
                if (this.mining && !blockFound && workData && allWorkersComplete) {
                    console.log(`📊 Submitting work proof: ${workData.totalHashes.toLocaleString()} hashes`);
                    console.log(`   Best hash: ${workData.bestHash.substring(0, 16)}...`);
                    
                    const response = await this.submitWorkProof(
                        workData.block_height,
                        workData.nonce_start,
                        workData.nonce_end,
                        workData.bestNonce,
                        workData.bestHash,
                        workData.totalHashes
                    );

                    if (response && response.success) {
                        this.stats.sharesSubmitted++;
                        const workUnits = response.work_units || 0;
                        this.stats.workUnits += workUnits;
                        console.log(`✅ Work proof accepted (${workUnits} work units this round)`);
                        this.updateStatus(`Work accepted - ${this.stats.sharesSubmitted} shares submitted`);
                    } else {
                        console.log(`❌ Work proof rejected or error: ${JSON.stringify(response)}`);
                    }
                } else if (!allWorkersComplete) {
                    console.log(`⚠️ Not submitting work proof - not all workers complete`);
                } else if (!this.mining) {
                    console.log(`⚠️ Not submitting work proof - mining stopped`);
                }

                // Reset current work
                this.currentWork = null;

                // Small delay before next work request
                await this.sleep(100);

            } catch (error) {
                console.error('❌ Mining loop error:', error);
                this.updateStatus('Error: ' + error.message);
                await this.sleep(5000);
            }
        }
    }

    async waitForBlockFound() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (!this.mining || !this.currentWork || 
                    this.workers.every(w => !w.mining)) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
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
