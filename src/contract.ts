import { parseAbi } from 'viem';
import type { Abi, Address } from 'viem';

/*
 * GiftPay — non-custodial programmable gifting on LitVM.
 *
 * This is a FORGED contract: not yet deployed. The platform rewrites this file
 * (address + wagmi.ts chain) at deploy time. While CONTRACT_READY is false, the
 * app runs in "preview mode" — wallet connect works, the full UI is live, and
 * on-chain calls are gated so nothing fails until the contract goes live.
 */
export const address: Address = '0x0000000000000000000000000000000000000000';
export const chainId = 4441;
export const CONTRACT_READY = address !== '0x0000000000000000000000000000000000000000';

export const abi: Abi = (() => {
  try {
    return parseAbi([
      // ---- Gift creation & claiming ----
      'function createGift(address recipient, uint8 giftType, uint256 amount, uint256 unlockTime) payable returns (uint256 giftId)',
      'function claimGift(uint256 giftId)',
      'function getGift(uint256 giftId) view returns (address sender, address recipient, uint8 giftType, uint256 amount, uint256 unlockTime, bool claimed)',
      'function giftCount() view returns (uint256)',
      'function giftsOf(address user) view returns (uint256[])',

      // ---- Rain mode ----
      'function startRain(uint256 totalAmount, uint256 participants) payable returns (uint256 rainId)',
      'function claimRain(uint256 rainId)',
      'function getRain(uint256 rainId) view returns (address sender, uint256 totalAmount, uint256 participants, uint256 perParticipant, uint256 claimedCount, bool active)',
      'function rainCount() view returns (uint256)',
      'function rainedAmount(address user) view returns (uint256)',

      // ---- Randomness oracle (dedicated — NOT blockhash) ----
      'function requestRandomness(uint256 rainId)',
      'function getRandomness(uint256 rainId) view returns (uint256)',

      // ---- Admin ----
      'function owner() view returns (address)',
      'function setOracle(address oracle)',

      // ---- Events (used to recover giftId/rainId from tx receipts) ----
      // NOTE: names/args here must match whatever the deployed contract actually
      // emits. If they don't match, log decoding just fails silently and the
      // app falls back to reading giftCount()/rainCount() instead — see App.tsx.
      'event GiftCreated(uint256 indexed giftId, address indexed sender, address indexed recipient, uint8 giftType, uint256 amount, uint256 unlockTime)',
      'event RainStarted(uint256 indexed rainId, address indexed sender, uint256 totalAmount, uint256 participants)',
    ]);
  } catch (e) {
    console.error('ABI parse failed — check signatures in src/contract.ts', e);
    return parseAbi(['function owner() view returns (address)']);
  }
})();
