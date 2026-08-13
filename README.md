# <p align="center">🎁 GiftPay</p>

<p align="center"><strong>Non-custodial, programmable gifting for zkLTC on LitVM.</strong></p>

<p align="center">
  Send gifts that unlock on time, on milestones, or by surprise. Every gift is a smart contract — you never give up custody, and recipients claim from their own wallet. No accounts, no signup, no custody.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/chain-LitVM%20Testnet-7C5CFF" alt="LitVM Testnet" />
  <img src="https://img.shields.io/badge/stack-Vite%20%2B%20React%20%2B%20TS-22D3EE" alt="Vite + React + TS" />
  <img src="https://img.shields.io/badge/web3-wagmi%20%2B%20viem-F0ABFC" alt="wagmi + viem" />
  <img src="https://img.shields.io/badge/license-MIT-9A9ABF" alt="MIT" />
</p>

---

## ✨ Features

| Feature | Description |
| --- | --- |
| **Programmable gifts** | Four gift types — time-limited, milestone, surprise, and scheduled — each encoded as on-chain rules. |
| **Non-custodial** | Your zkLTC moves into the gift contract and is released only when the recipient claims. GiftPay never holds funds. |
| **Shareable links + QR** | Every gift produces a claim link with a scannable QR code. The recipient opens it in any wallet. |
| **Rain mode** | Deposit a total, pick participants, and GiftPay distributes it evenly — randomness from a dedicated oracle, never blockhash. |
| **Wallet-first** | Connect with MetaMask, Rabby, or any EIP-6963 wallet via injected discovery. No accounts, no signup. |

## 🧱 Stack

- **Frontend** — [Vite](https://vitejs.dev/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Web3** — [wagmi](https://wagmi.sh/) + [viem](https://viem.sh/) + [@tanstack/react-query](https://tanstack.com/query)
- **Chain** — [LitVM Testnet](https://www.litvm.com/) — a zero-knowledge EVM-compatible rollup secured by Litecoin
- **Styling** — Tailwind CSS with a custom Degen Premium design system

## 🚀 Getting Started

```bash
# install dependencies
npm install

# start the dev server (Vite, port 5173)
npm run dev

# production build
npm run build

# preview the production build
npm run preview
```

Open [http://localhost:5173](http://localhost:5173) and connect your wallet to start gifting.

## 🔌 Wallet Setup

GiftPay uses `injected()` connector discovery (EIP-6963), so any installed browser wallet works:

- **MetaMask** — [metamask.io](https://metamask.io/)
- **Rabby** — [rabby.io](https://rabby.io/)
- **Any EIP-6963 wallet**

You'll be prompted to switch to the **LitVM Testnet** if you're on another network. The chain config lives in [`src/wagmi.ts`](src/wagmi.ts).

## 🚀 Deploying the Contract (Going Live)

GiftPay is built around a **forged contract** — the ABI is real and wired into the app, but the contract isn't on-chain yet. The app runs in **preview mode** until you deploy it: wallet connect works, the full UI is live, and on-chain calls are safely gated so nothing fails.

### How the live switch works

The whole flow is driven by **two files** the platform rewrites automatically at deploy time:

| File | What changes |
| --- | --- |
| `src/contract.ts` | The zero-address placeholder (`0x0000…0000`) is replaced with the **real deployed address**. `CONTRACT_READY` flips from `false` to `true`. |
| `src/wagmi.ts` | The chain config is pointed at the **real LitVM Testnet RPC** and explorer. |

`CONTRACT_READY` is the single gate. While it's `false`, the app shows preview-mode hints and every `useReadContract` / `useWriteContract` is gated off. The moment it flips `true`, all on-chain reads and writes activate — no code changes needed.

### To deploy

> **Deploy the contract from the chat.** The platform compiles the ABI from `src/contract.ts`, deploys it to LitVM Testnet, then rewrites `src/contract.ts` and `src/wagmi.ts` with the live address and RPC. That's the entire process — there's no manual step on your side.

Once deployed:

1. **The address** in `src/contract.ts` becomes the real contract address.
2. **`CONTRACT_READY`** flips to `true` automatically.
3. **On-chain state** — gifts created, rain events, and amounts received — reads live from the contract instead of showing placeholders.
4. **Creating a gift** and **starting rain** submit real transactions from your wallet.

### Before you deploy — check the ABI

The ABI in `src/contract.ts` is what gets compiled and deployed. Make sure the function signatures match your intended contract exactly — the app calls these by name:

- `createGift(recipient, giftType, amount, unlockTime)` — payable, creates a gift
- `claimGift(giftId)` — claims a gift
- `getGift(giftId)` / `giftCount()` / `giftsOf(user)` — gift reads
- `startRain(totalAmount, participants)` — payable, starts a rain
- `claimRain(rainId)` / `getRain(rainId)` / `rainCount()` / `rainedAmount(user)` — rain reads
- `requestRandomness(rainId)` / `getRandomness(rainId)` — dedicated randomness oracle
- `owner()` / `setOracle(oracle)` — admin controls

### After deployment

- **Admin controls** (`setOracle`) are gated behind the connected owner account — they only activate for the wallet that deployed the contract.
- **Rain randomness** uses the dedicated oracle, never blockhash — LitVM block hashes aren't cryptographically secure for randomness.
- The **explorer link** after each transaction points at the live LitVM Testnet explorer.

## 📦 Contract

The GiftPay contract ABI and address live in [`src/contract.ts`](src/contract.ts).

### Core functions

| Function | Description |
| --- | --- |
| `createGift(recipient, giftType, amount, unlockTime)` | Create a gift with a recipient, type, amount, and unlock timestamp. |
| `claimGift(giftId)` | Claim a gift that has met its unlock conditions. |
| `getGift(giftId)` | Read a gift's full state — sender, recipient, type, amount, unlock time, claimed. |
| `giftCount()` / `giftsOf(user)` | Read gift totals and a user's gift list. |
| `startRain(totalAmount, participants)` | Start a rain distribution across participants. |
| `claimRain(rainId)` | Claim your share of a rain event. |
| `getRain(rainId)` / `rainCount()` / `rainedAmount(user)` | Read rain state and totals. |
| `requestRandomness(rainId)` / `getRandomness(rainId)` | Dedicated randomness oracle — never blockhash. |
| `owner()` / `setOracle(oracle)` | Admin controls for the contract owner. |

## 🧩 Project Structure

```
├── index.html              # Entry HTML, favicon, title
├── src/
│   ├── main.tsx            # Provider tree (Wagmi → QueryClient → App)
│   ├── wagmi.ts            # Chain config + createConfig + QueryClient
│   ├── contract.ts         # Contract ABI + address + CONTRACT_READY gate
│   ├── index.css           # Degen Premium design system (tokens, glass, buttons)
│   └── App.tsx             # Full app — nav, hero, create, rain, how-it-works
```

## 🎨 Design System

GiftPay ships with a **Degen Premium** aesthetic — dark, glassy, and crypto-native:

- **Palette** — deep near-black `#0A0A14`, frosted-glass surfaces `#141426`, electric violet `#7C5CFF` → cyan `#22D3EE` gradients used sparingly.
- **Typography** — Space Grotesk for display, Inter for body, Geist Mono for numbers, addresses, and tickers.
- **Motion** — 200–300ms ease transitions, gentle glow pulses, rise-in reveals (respects `prefers-reduced-motion`).
- **Tokens** — all colors live as CSS variables in the `:root` block of [`src/index.css`](src/index.css). Recolor there, never in JSX.

## 🔒 Security

- **Non-custodial** — funds are locked in the contract, never held by the app.
- **Dedicated randomness** — rain distribution uses a dedicated oracle, never blockhash, because LitVM block hashes aren't cryptographically secure for randomness.
- **No private keys** — GiftPay never touches your keys; all signing happens in your wallet.

## 📄 License

MIT

---

<p align="center">Made by <a href="https://dappit.io">dappit.io</a></p>
