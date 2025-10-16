# Stellaris WASM Miner

A high-performance browser-based cryptocurrency miner for Stellaris, built with Rust and WebAssembly (WASM).

## Features

- ⚡ **High Performance**: Compiled to WebAssembly for near-native speed
- 🌐 **Browser-Based**: Mine directly from your web browser
- 🎯 **Pool Mining**: Connects to Stellaris mining pools
- 📊 **Real-time Statistics**: Live hashrate, shares, and block statistics
- 💻 **Modern UI**: Clean, responsive interface for easy management
- ⚙️ **Easy Configuration**: Simple setup with wallet address and pool URL

## Architecture

This miner consists of three main components:

1. **Rust Core (`src/lib.rs`)**: High-performance mining algorithm compiled to WASM
2. **JavaScript Wrapper (`miner.js`)**: Handles pool communication and work coordination
3. **HTML Interface (`index.html`)**: User-friendly management dashboard

## Prerequisites

- **Rust & Cargo**: [Install Rust](https://rustup.rs/)
- **wasm-pack**: Install with `curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh`
- **Web Server**: Python's http.server, Node's http-server, or any static file server

## Building

1. Clone the repository and navigate to the wasm-miner directory:
   ```bash
   cd wasm-miner
   ```

2. Make the build script executable:
   ```bash
   chmod +x build.sh
   ```

3. Build the WASM module:
   ```bash
   ./build.sh
   ```

   This will compile the Rust code to WebAssembly and generate the necessary files in the `pkg/` directory.

## Running

1. Start a local web server:
   ```bash
   # Using Python 3
   python3 -m http.server 8080
   
   # Or using Node.js
   npx serve .
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

3. Configure the miner:
   - **Pool URL**: Enter your mining pool URL (default: `https://stellaris-pool.connor33341.dev`)
   - **Wallet Address**: Enter your Stellaris wallet address
   - **Worker Name**: (Optional) Give your miner a unique name

4. Click "Start Mining" and watch the statistics!

## Configuration

### Pool URL
The default pool URL is `https://stellaris-pool.connor33341.dev`. You can use any compatible Stellaris mining pool.

### Wallet Address
Your Stellaris wallet address where mining rewards will be sent. Must be at least 40 characters long.

### Worker Name
Optional identifier for this miner instance. If not provided, a random name will be generated.

## Performance Tips

1. **Keep Tab Active**: Browser throttles inactive tabs, reducing mining performance
2. **Modern Browser**: Use latest Chrome, Firefox, or Edge for best WASM performance
3. **Single Tab**: Run one miner instance per device for optimal performance
4. **Stable Connection**: Ensure stable internet connection to the mining pool

## How It Works

1. **Registration**: Miner registers with the pool using your wallet address
2. **Work Assignment**: Pool assigns a nonce range to mine
3. **Mining**: WASM module computes SHA256 hashes at high speed
4. **Share Submission**: When valid hashes are found, they're submitted to the pool
5. **Rewards**: Pool distributes rewards based on contributed work

## Mining Statistics

- **H/s**: Current hashrate (hashes per second)
- **Total Hashes**: Cumulative hashes computed
- **Shares Submitted**: Number of work proofs submitted
- **Blocks Found**: Valid blocks discovered by this miner
- **Work Units**: Accumulated work credit from the pool
- **Uptime**: Time elapsed since mining started

## Troubleshooting

### WASM Module Fails to Load
- Ensure you're serving files from a web server (not `file://` protocol)
- Check browser console for detailed error messages
- Verify `pkg/` directory exists and contains WASM files

### Low Hashrate
- Keep the browser tab active (browsers throttle background tabs)
- Try a different browser (Chrome/Edge typically perform best)
- Check CPU usage - ensure system isn't overloaded

### Connection Errors
- Verify pool URL is correct and accessible
- Check your internet connection
- Ensure pool is online and accepting connections

### Invalid Wallet Address
- Wallet address must be at least 40 characters
- Supports both hex and base58 formats
- Double-check for typos

## Development

### Project Structure
```
wasm-miner/
├── src/
│   └── lib.rs           # Rust mining core
├── Cargo.toml           # Rust dependencies
├── miner.js             # JavaScript wrapper
├── index.html           # Web interface
├── styles.css           # Styling
├── build.sh             # Build script
├── README.md            # This file
└── pkg/                 # Generated WASM files (after build)
```

### Building for Development
```bash
wasm-pack build --target web --dev
```

### Building for Production
```bash
wasm-pack build --target web --release
```

## Technical Details

### Mining Algorithm
Matches the Stellaris protocol exactly:
- SHA256 hashing
- 4-byte little-endian nonce
- Difficulty-based validation
- Compatible with Stellaris blockchain format

### WASM Benefits
- Near-native performance (often 80-90% of native speed)
- Safe sandboxed execution
- Cross-platform compatibility
- No installation required

## Comparison with Python Miner

| Feature | WASM Miner | Python Miner |
|---------|-----------|--------------|
| Platform | Browser | Command-line |
| Performance | ~5-20 kH/s | ~10-50 kH/s |
| Setup | No install | Python required |
| Interface | Web GUI | Terminal |
| Portability | Any device with browser | Python environment needed |

## License

This project follows the same license as the Stellaris pool project.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review browser console for error messages
3. Ensure you're using the latest build
4. Open an issue on GitHub

## Credits

Based on the Stellaris Pool Miner by connor33341.

Built with:
- [Rust](https://www.rust-lang.org/)
- [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen)
- [wasm-pack](https://github.com/rustwasm/wasm-pack)

---

**Happy Mining! ⛏️**
