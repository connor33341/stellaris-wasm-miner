/**
 * Stellaris WASM Mining Worker
 * Each worker handles mining operations independently
 */

let wasmModule = null;
let workerId = null;
let mining = false;

// Initialize the worker
self.addEventListener('message', async (e) => {
    const { type, data } = e.data;

    switch (type) {
        case 'init':
            await initWasm(data.wasmPath, data.workerId);
            break;
        case 'mine':
            await mineChunk(data);
            break;
        case 'stop':
            mining = false;
            break;
    }
});

async function initWasm(wasmPath, id) {
    try {
        workerId = id;
        
        // Import the WASM module
        const wasm = await import(wasmPath);
        await wasm.default();
        wasmModule = wasm;
        
        self.postMessage({
            type: 'initialized',
            workerId: workerId
        });
    } catch (error) {
        self.postMessage({
            type: 'error',
            workerId: workerId,
            error: error.message
        });
    }
}

async function mineChunk(params) {
    const {
        previous_hash,
        pool_address,
        merkle_root,
        timestamp,
        difficulty,
        nonce_start,
        nonce_end,
        chunk_size
    } = params;

    mining = true;
    let currentNonce = nonce_start;

    try {
        while (currentNonce < nonce_end && mining) {
            const chunkEnd = Math.min(currentNonce + chunk_size, nonce_end);
            
            // Mine chunk using WASM
            const result = wasmModule.mine_range(
                previous_hash,
                pool_address,
                merkle_root,
                timestamp,
                difficulty,
                currentNonce,
                chunkEnd,
                chunk_size
            );

            // Send result back to main thread
            self.postMessage({
                type: 'result',
                workerId: workerId,
                result: {
                    found: result.found,
                    nonce: result.nonce,
                    hash: result.hash,
                    hashes_computed: result.hashes_computed,
                    best_nonce: result.best_nonce,
                    best_hash: result.best_hash,
                    completed_range: currentNonce >= nonce_end - chunk_size
                }
            });

            // If block found, stop this worker
            if (result.found) {
                mining = false;
                break;
            }

            currentNonce = chunkEnd;
        }

        // Notify that this worker is done with the range
        if (currentNonce >= nonce_end) {
            self.postMessage({
                type: 'range_complete',
                workerId: workerId
            });
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            workerId: workerId,
            error: error.message
        });
    }
}
