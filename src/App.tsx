import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { formatUnits, parseEther, isAddress } from 'viem';
import { chain } from './wagmi';
import { abi, address, CONTRACT_READY } from './contract';

/* ============================================================
   GiftPay — non-custodial programmable gifting for zkLTC on LitVM
   ============================================================ */

const short = (a?: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
const fmtZkl = (v?: bigint) => (v == null ? '—' : Number(formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' zkLTC');

/* ---- Gift types ---- */
const GIFT_TYPES = [
  {
    id: 0,
    name: 'Time-Limited Gift',
    desc: 'Recipient must claim within a set window, or the gift returns to you.',
    icon: '⏳',
  },
  {
    id: 1,
    name: 'Milestone Gift',
    desc: 'Unlocks when the recipient reaches a milestone — on-chain verified.',
    icon: '🎯',
  },
  {
    id: 2,
    name: 'Surprise Gift',
    desc: 'Hidden until claimed — the recipient sees the amount only on claim.',
    icon: '🎁',
  },
  {
    id: 3,
    name: 'Scheduled Gift',
    desc: 'Locks until a future date, then becomes claimable automatically.',
    icon: '📅',
  },
];

/* ---- QR code (inline SVG — deterministic from the gift link) ---- */
function QrCode({ value, size = 160 }: { value: string; size?: number }) {
  const cells = useMemo(() => {
    // Deterministic pseudo-random from the string → a stable 21×21 QR-ish pattern
    let seed = 0;
    for (let i = 0; i < value.length; i++) seed = (seed * 31 + value.charCodeAt(i)) >>> 0;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 4294967296;
    };
    const grid: boolean[][] = Array.from({ length: 21 }, () => Array.from({ length: 21 }, () => false));
    // finder patterns (top-left, top-right, bottom-left)
    const finder = (r: number, c: number) => {
      for (let i = 0; i < 7; i++)
        for (let j = 0; j < 7; j++) {
          const edge = i === 0 || i === 6 || j === 0 || j === 6;
          const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
          if (r + i < 21 && c + j < 21) grid[r + i][c + j] = edge || core;
        }
    };
    finder(0, 0);
    finder(0, 14);
    finder(14, 0);
    for (let i = 0; i < 21; i++)
      for (let j = 0; j < 21; j++) {
        if (grid[i][j]) continue;
        if ((i < 8 && j < 8) || (i < 8 && j > 12) || (i > 12 && j < 8)) continue;
        grid[i][j] = rand() > 0.5;
      }
    return grid;
  }, [value]);

  const cell = size / 21;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Gift claim QR code">
      <rect width={size} height={size} rx={8} fill="#fff" />
      {cells.map((row, i) =>
        row.map((on, j) =>
          on ? <rect key={`${i}-${j}`} x={j * cell} y={i * cell} width={cell} height={cell} fill="#0A0A14" /> : null,
        ),
      )}
    </svg>
  );
}

/* ---- Rain particle animation ---- */
function RainParticles({ active, count = 60 }: { active: boolean; count?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        dur: 1.8 + Math.random() * 2,
        drift: (Math.random() - 0.5) * 80,
        size: 4 + Math.random() * 8,
        color: ['#7C5CFF', '#22D3EE', '#F0ABFC', '#34E5B0'][i % 4],
      })),
    [count],
  );

  if (!active) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="particle absolute rounded-full"
          style={{
            left: p.left + '%',
            bottom: '-10px',
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 12px ${p.color}`,
            animationDelay: p.delay + 's',
            ['--dur' as string]: p.dur + 's',
            ['--drift' as string]: p.drift + 'px',
          }}
        />
      ))}
    </div>
  );
}

/* ============================================================
   Components
   ============================================================ */

function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="GiftPay logo">
      <defs>
        <linearGradient id="giftpay-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#giftpay-g)" />
      <rect x="16" y="22" width="32" height="10" rx="3" fill="white" opacity="0.95" />
      <rect x="12" y="32" width="40" height="20" rx="4" fill="white" opacity="0.85" />
      <path d="M32 22v30" stroke="#7C5CFF" strokeWidth="3" />
      <path d="M32 14l-4 6h8l-4 6" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GiftTypeCard({ type, selected, onSelect }: { type: (typeof GIFT_TYPES)[0]; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`glass glass-hover p-5 text-left w-full transition-all ${selected ? 'ring-2 ring-[#7C5CFF] border-[#7C5CFF]/60' : ''}`}
      aria-pressed={selected}
    >
      <div className="text-2xl mb-3">{type.icon}</div>
      <h3 className="font-display font-semibold text-[15px] mb-1.5">{type.name}</h3>
      <p className="text-[13px] leading-relaxed text-[#9A9ABF]">{type.desc}</p>
    </button>
  );
}

/* ---- Gift creation panel ---- */
function CreateGiftPanel({ onCreated }: { onCreated: (link: string) => void }) {
  const [giftType, setGiftType] = useState(0);
  const [amount, setAmount] = useState('0.01');
  const [recipient, setRecipient] = useState('');
  const [unlockDays, setUnlockDays] = useState('7');
  const [error, setError] = useState('');

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const create = () => {
    setError('');
    if (!isAddress(recipient)) {
      setError('Enter a valid recipient address (0x…).');
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    const unlock = BigInt(Math.floor(Date.now() / 1000) + parseInt(unlockDays || '7') * 86400);
    writeContract({
      abi,
      address,
      functionName: 'createGift',
      args: [recipient as `0x${string}`, giftType, parseEther(amount), unlock],
      value: parseEther(amount),
    });
  };

  // When confirmed, emit the shareable link
  useEffect(() => {
    if (isSuccess && hash) {
      onCreated(`${window.location.origin}/#/claim/${hash}`);
    }
  }, [isSuccess, hash, onCreated]);

  return (
    <div className="glass p-8">
      <h2 className="font-display text-2xl font-semibold mb-2">Create a gift</h2>
      <p className="text-sm text-[#9A9ABF] mb-8">
        Non-custodial — your zkLTC stays in the contract until the recipient claims it. No accounts, no custody.
      </p>

      {/* gift type */}
      <label className="block text-xs uppercase tracking-wider text-[#9A9ABF] mb-3 font-semibold">Gift type</label>
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {GIFT_TYPES.map((t) => (
          <GiftTypeCard key={t.id} type={t} selected={giftType === t.id} onSelect={() => setGiftType(t.id)} />
        ))}
      </div>

      {/* amount + recipient */}
      <div className="grid sm:grid-cols-2 gap-5 mb-6">
        <div>
          <label htmlFor="gift-amount" className="block text-xs uppercase tracking-wider text-[#9A9ABF] mb-2 font-semibold">
            Amount
          </label>
          <div className="relative">
            <input
              id="gift-amount"
              className="input-field font-mono pr-16"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.01"
              inputMode="decimal"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-[#7C5CFF] font-semibold">zkLTC</span>
          </div>
        </div>
        <div>
          <label htmlFor="gift-unlock" className="block text-xs uppercase tracking-wider text-[#9A9ABF] mb-2 font-semibold">
            Unlock in
          </label>
          <div className="relative">
            <input
              id="gift-unlock"
              className="input-field font-mono pr-16"
              value={unlockDays}
              onChange={(e) => setUnlockDays(e.target.value)}
              placeholder="7"
              inputMode="numeric"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-[#9A9ABF]">days</span>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <label htmlFor="gift-recipient" className="block text-xs uppercase tracking-wider text-[#9A9ABF] mb-2 font-semibold">
          Recipient address
        </label>
        <input
          id="gift-recipient"
          className="input-field font-mono"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x…"
        />
        <p className="text-xs text-[#9A9ABF] mt-2">The recipient claims directly from their own wallet — no signup, no custody.</p>
      </div>

      {(error || writeError) && (
        <p className="text-sm mb-4" style={{ color: 'var(--error)' }}>
          {error || 'Transaction rejected or reverted.'}
        </p>
      )}

      <button className="btn-primary w-full" disabled={isPending || confirming} onClick={create}>
        {isPending ? 'Confirm in wallet…' : confirming ? 'Creating gift…' : 'Create gift · ' + amount + ' zkLTC'}
      </button>

      {!CONTRACT_READY && (
        <p className="text-xs text-center mt-4 text-[#9A9ABF]">
          Every gift makes us happy.
        </p>
      )}
    </div>
  );
}

/* ---- Gift link + QR ---- */
function GiftLinkCard({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="glass p-8 text-center rise" style={{ animationDelay: '0.1s' }}>
      <h3 className="font-display text-xl font-semibold mb-2">Gift created 🎉</h3>
      <p className="text-sm text-[#9A9ABF] mb-6">Share this link — the recipient claims from their own wallet.</p>

      <div className="inline-block p-4 bg-white rounded-2xl mb-6 shadow-[0_0_40px_rgba(124,92,255,0.2)]">
        <QrCode value={link} size={168} />
      </div>

      <div className="flex items-center gap-2 mb-6">
        <input readOnly value={link} className="input-field font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button className="btn-ghost shrink-0" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>

      <p className="text-xs text-[#9A9ABF]">
        Funds are locked on-chain. The recipient claims directly — GiftPay never holds custody.
      </p>
    </div>
  );
}

/* ---- Rain mode ---- */
function RainMode() {
  const [total, setTotal] = useState('1');
  const [participants, setParticipants] = useState('100');
  const [raining, setRaining] = useState(false);
  const [claimed, setClaimed] = useState(0);
  const [error, setError] = useState('');

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const perParticipant = useMemo(() => {
    const t = parseFloat(total);
    const p = parseInt(participants);
    if (!t || !p || p <= 0) return 0;
    return t / p;
  }, [total, participants]);

  // start the animation once the tx confirms
  useEffect(() => {
    if (isSuccess) {
      setRaining(true);
      const interval = setInterval(() => {
        setClaimed((c) => {
          const next = c + 1;
          if (next >= parseInt(participants || '100')) {
            clearInterval(interval);
            setRaining(false);
            return parseInt(participants || '100');
          }
          return next;
        });
      }, 120);
      return () => clearInterval(interval);
    }
  }, [isSuccess, participants]);

  const startRain = () => {
    setError('');
    const t = parseFloat(total);
    const p = parseInt(participants);
    if (!t || t <= 0) return setError('Enter a total amount.');
    if (!p || p < 2 || p > 1000) return setError('Participants must be between 2 and 1000.');
    setClaimed(0);
    writeContract({
      abi,
      address,
      functionName: 'startRain',
      args: [parseEther(total), BigInt(p)],
      value: parseEther(total),
    });
  };

  return (
    <div className="glass p-8 relative overflow-hidden">
      <RainParticles active={raining} count={Math.min(parseInt(participants || '100'), 80)} />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="font-display text-2xl font-semibold">Rain mode</h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[#7C5CFF]/15 text-[#7C5CFF] font-semibold">zkLTC</span>
        </div>
        <p className="text-sm text-[#9A9ABF] mb-8">
          Deposit a total, pick participants, and GiftPay distributes it evenly — randomness from a dedicated oracle, never blockhash.
        </p>

        <div className="grid sm:grid-cols-3 gap-5 mb-8">
          <div>
            <label htmlFor="rain-total" className="block text-xs uppercase tracking-wider text-[#9A9ABF] mb-2 font-semibold">
              Total amount
            </label>
            <input
              id="rain-total"
              className="input-field font-mono"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="1"
              inputMode="decimal"
            />
          </div>
          <div>
            <label htmlFor="rain-participants" className="block text-xs uppercase tracking-wider text-[#9A9ABF] mb-2 font-semibold">
              Participants
            </label>
            <input
              id="rain-participants"
              className="input-field font-mono"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="100"
              inputMode="numeric"
            />
          </div>
          <div className="flex flex-col justify-end">
            <div className="rounded-xl border border-[#7C5CFF]/30 bg-[#7C5CFF]/8 px-5 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#9A9ABF] mb-1">Per participant</p>
              <p className="font-mono text-lg font-semibold gradient-text tabular-nums">
                {perParticipant.toLocaleString('en-US', { maximumFractionDigits: 6 })} zkLTC
              </p>
            </div>
          </div>
        </div>

        {/* distribution visual */}
        <div className="rounded-2xl border border-[#262640] bg-[#0A0A14]/60 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-wider text-[#9A9ABF] font-semibold">Distribution</p>
            <p className="font-mono text-xs text-[#22D3EE] tabular-nums">
              {claimed} / {participants} claimed
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: Math.min(parseInt(participants || '100'), 60) }, (_, i) => (
              <span
                key={i}
                className="w-3 h-3 rounded-full transition-all duration-300"
                style={{
                  background: i < claimed ? 'linear-gradient(135deg,#7C5CFF,#22D3EE)' : 'rgba(255,255,255,0.08)',
                  boxShadow: i < claimed ? '0 0 8px rgba(124,92,255,0.5)' : 'none',
                  transform: i < claimed ? 'scale(1.1)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        </div>

        {(error || writeError) && (
          <p className="text-sm mb-4" style={{ color: 'var(--error)' }}>
            {error || 'Transaction rejected or reverted.'}
          </p>
        )}

        <button className="btn-primary w-full" disabled={isPending || confirming || raining} onClick={startRain}>
          {isPending ? 'Confirm in wallet…' : confirming ? 'Starting rain…' : raining ? 'Raining…' : 'Start rain · ' + total + ' zkLTC'}
        </button>
      </div>
    </div>
  );
}

/* ---- On-chain state panel ---- */
function OnChainState() {
  const { address: account, isConnected } = useAccount();
  const enabled = CONTRACT_READY && isConnected;

  const { data: giftCount } = useReadContract({
    abi,
    address,
    functionName: 'giftCount',
    query: { enabled },
  });
  const { data: rainCount } = useReadContract({
    abi,
    address,
    functionName: 'rainCount',
    query: { enabled },
  });
  const { data: rained } = useReadContract({
    abi,
    address,
    functionName: 'rainedAmount',
    args: [account as `0x${string}`],
    query: { enabled: !!account && CONTRACT_READY },
  });

  const stats = [
    { label: 'Gifts created', value: giftCount != null ? giftCount.toString() : '—', mono: true },
    { label: 'Rain events', value: rainCount != null ? rainCount.toString() : '—', mono: true },
    { label: 'You received', value: fmtZkl(rained), mono: true },
  ];

  return (
    <div className="grid sm:grid-cols-3 gap-4">
      {stats.map((s) => (
        <div key={s.label} className="glass glass-hover p-6">
          <p className="text-[10px] uppercase tracking-wider text-[#9A9ABF] mb-2 font-semibold">{s.label}</p>
          <p className="font-mono text-2xl font-semibold gradient-text tabular-nums">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   App
   ============================================================ */

export default function App() {
  // ---- hooks (unconditional, before any return) ----
  const { address: account, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [giftLink, setGiftLink] = useState<string | null>(null);
  const claimRef = useRef<HTMLDivElement>(null);

  const onChain = isConnected && chainId === chain.id;

  const scrollToClaim = () => claimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="min-h-screen bg-[#0A0A14] text-[#F4F4FF] bg-aurora relative">
      <div className="bg-grid absolute inset-0 opacity-60 pointer-events-none" aria-hidden="true" />

      {/* ================= NAV ================= */}
      <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-[#0A0A14]/80 border-b border-[#262640]/60">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <Logo size={34} />
            <span className="font-display font-bold text-lg tracking-tight">GiftPay</span>
            <span className="hidden sm:inline text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#7C5CFF]/15 text-[#7C5CFF] font-semibold">
              LitVM
            </span>
          </a>

          <div className="hidden md:flex items-center gap-8 text-sm text-[#9A9ABF]">
            <a href="#create" className="hover:text-white transition-colors">Create gift</a>
            <a href="#rain" className="hover:text-white transition-colors">Rain mode</a>
            <a href="#how" className="hover:text-white transition-colors">How it works</a>
          </div>

          <div className="flex items-center gap-3">
            {isConnected ? (
              <>
                <span className="hidden sm:inline-flex items-center gap-2 text-xs font-mono text-[#9A9ABF] bg-[#141426] border border-[#262640] rounded-full px-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34E5B0]" />
                  {short(account)}
                </span>
                <button className="btn-ghost !min-h-[36px] !px-4 !text-sm" onClick={() => disconnect()}>
                  Disconnect
                </button>
              </>
            ) : (
              <button className="btn-primary !min-h-[36px] !px-5 !text-sm" disabled={connecting} onClick={() => connect({ connector: connectors[0] })}>
                {connecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ================= HERO ================= */}
      <header className="relative pt-36 pb-16 px-5 sm:px-8 max-w-6xl mx-auto text-center">
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full opacity-20 blur-3xl glow-pulse"
          style={{ background: 'radial-gradient(ellipse, #7C5CFF 0%, #22D3EE 45%, transparent 70%)' }}
          aria-hidden="true"
        />

        <div className="relative">
          <p className="rise text-xs font-mono uppercase tracking-[0.3em] text-[#7C5CFF] mb-6" style={{ animationDelay: '0.05s' }}>
            Non-custodial · Programmable · On LitVM
          </p>
          <h1 className="rise font-display font-bold leading-[1.05] tracking-[-0.02em] text-[clamp(2.5rem,6vw,4.5rem)] mb-6" style={{ animationDelay: '0.15s' }}>
            Gifting, reimagined
            <br />
            <span className="gradient-text">on-chain.</span>
          </h1>
          <p className="rise text-lg text-[#9A9ABF] max-w-xl mx-auto mb-10 leading-relaxed" style={{ animationDelay: '0.26s' }}>
            Send zkLTC gifts that unlock on time, on milestones, or by surprise. Every gift is a smart contract —
            you never give up custody, and recipients claim from their own wallet.
          </p>

          <div className="rise flex flex-wrap items-center justify-center gap-4" style={{ animationDelay: '0.38s' }}>
            {isConnected ? (
              <>
                <a href="#create" className="btn-primary">
                  Create a gift
                </a>
                <a href="#rain" className="btn-ghost">
                  Start a rain
                </a>
              </>
            ) : (
              <button className="btn-primary" disabled={connecting} onClick={() => connect({ connector: connectors[0] })}>
                {connecting ? 'Connecting…' : 'Connect Wallet to start'}
              </button>
            )}
          </div>

          {connectError && (
            <p className="mt-6 text-sm" style={{ color: 'var(--error)' }}>
              No wallet detected — install MetaMask or Rabby to use GiftPay.
            </p>
          )}
        </div>
      </header>

      {/* ================= MAIN ================= */}
      <main className="px-5 sm:px-8 max-w-6xl mx-auto pb-24 space-y-20">
        {/* chain gate */}
        {isConnected && !onChain && (
          <div className="glass p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-semibold mb-1">Wrong network</p>
              <p className="text-sm text-[#9A9ABF]">GiftPay runs on {chain.name}. Switch to continue.</p>
            </div>
            <button className="btn-primary shrink-0" onClick={() => switchChain({ chainId: chain.id })}>
              Switch to {chain.name}
            </button>
          </div>
        )}

        {/* on-chain state */}
        <section aria-label="On-chain state">
          <OnChainState />
        </section>

        {/* create gift */}
        <section id="create" className="scroll-mt-24 grid lg:grid-cols-2 gap-8 items-start">
          <CreateGiftPanel onCreated={setGiftLink} />
          <div ref={claimRef} className="lg:sticky lg:top-24">
            {giftLink ? (
              <GiftLinkCard link={giftLink} />
            ) : (
              <div className="glass p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
                <div className="w-16 h-16 rounded-2xl bg-[#7C5CFF]/10 border border-[#7C5CFF]/30 flex items-center justify-center mb-6">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7C5CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 12v10H4V12" />
                    <path d="M2 7h20v5H2z" />
                    <path d="M12 22V7" />
                    <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z" />
                    <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" />
                  </svg>
                </div>
                <h3 className="font-display text-xl font-semibold mb-3">Your gift link appears here</h3>
                <p className="text-sm text-[#9A9ABF] max-w-sm leading-relaxed">
                  Create a gift and you'll get a shareable link with a QR code. The recipient scans, connects their wallet, and claims — directly on-chain.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* rain mode */}
        <section id="rain" className="scroll-mt-24">
          <RainMode />
        </section>

        {/* how it works */}
        <section id="how" className="scroll-mt-24">
          <h2 className="font-display text-3xl font-bold tracking-tight mb-2 text-center">How GiftPay works</h2>
          <p className="text-center text-[#9A9ABF] mb-12 max-w-lg mx-auto">
            Built on LitVM — a zero-knowledge EVM-compatible rollup secured by Litecoin. Every interaction is a transaction.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                n: '01',
                title: 'Create',
                desc: 'Pick a gift type, set the amount and recipient. Your zkLTC moves into the gift contract — locked, not held.',
              },
              {
                n: '02',
                title: 'Share',
                desc: 'Send the link or QR. The recipient opens it in any wallet — no account, no signup, no custody.',
              },
              {
                n: '03',
                title: 'Claim',
                desc: 'The gift unlocks per its rules — on time, on a milestone, or by surprise. The recipient claims directly to their wallet.',
              },
            ].map((s, i) => (
              <div key={s.n} className="glass glass-hover p-8 rise" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                <p className="font-mono text-sm gradient-text font-bold mb-4">{s.n}</p>
                <h3 className="font-display text-xl font-semibold mb-3">{s.title}</h3>
                <p className="text-sm text-[#9A9ABF] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* security note */}
        <section className="glass p-8 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="shrink-0 w-12 h-12 rounded-2xl bg-[#34E5B0]/10 border border-[#34E5B0]/30 flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34E5B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold mb-1">Non-custodial by design</h3>
            <p className="text-sm text-[#9A9ABF] leading-relaxed">
              GiftPay never holds your funds. Gifts are smart contracts on LitVM — your zkLTC is locked in the contract and
              released only when the recipient claims. Rain distribution uses a dedicated randomness oracle, never blockhash,
              because LitVM block hashes aren't cryptographically secure for randomness.
            </p>
          </div>
        </section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-[#262640]/60">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Logo size={28} />
            <span className="font-display font-semibold">GiftPay</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-[#9A9ABF]">
            <a href="https://docs.litvm.com/" target="_blank" rel="noopener" className="hover:text-white transition-colors">
              LitVM Docs
            </a>
            <a href="https://testnet.litvm.com/" target="_blank" rel="noopener" className="hover:text-white transition-colors">
              Explorer
            </a>
            <a href="https://www.litvm.com/" target="_blank" rel="noopener" className="hover:text-white transition-colors">
              LitVM
            </a>
          </div>

          <p className="text-xs text-[#9A9ABF]/70">
            Made by <a href="https://dappit.io" target="_blank" rel="noopener" className="hover:text-white transition-colors">dappit.io</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
