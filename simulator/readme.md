# Halonyx Protocol Simulator

An interactive, zero-dependency browser explainer that walks through how Halonyx establishes end-to-end encryption using the **Signal Protocol (X3DH + Double Ratchet)**, **Safety Numbers**, and **P2P File Transfer**.

## Key Features

- **Beginner & Protocol Modes**: Toggle between plain-English analogies and technical protocol specifications.
- **🎨 Paint Mixing Analogy (ELI5)**: Visualizes Diffie-Hellman key exchange using color mixing (Yellow + Red/Blue).
- **⚡ Try Eavesdropping (Hack Server Inspector)**: Interactive simulated hacker console showing that the server only holds encrypted ciphertext and cannot read messages without Bob's private device key.
- **📱 3-Pane View**: Displays real-time side-by-side views of Alice's device (plaintext), the Server relay (ciphertext), and Bob's device (decrypted text).
- **🔊 Native Audio Guide**: One-click text-to-speech audio explanation powered by the Web Speech Synthesis API.
- **14-Step Guided Architecture**: Complete walkthrough covering setup, key exchange, OPK exhaustion, key substitution MITM attacks, Safety Numbers, offline delivery, and triple-database isolation.

## Usage

Open `index.html` directly in any web browser. No web server or external dependencies required!
