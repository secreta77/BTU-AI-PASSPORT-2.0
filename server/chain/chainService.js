// ethers v6: issue() from the BTU issuer wallet, read functions, RPC fallback.
// Nothing here fails at import time: config is checked only when a function is used (Decision 16).
import fs from 'node:fs';
import { ethers } from 'ethers';
import { config } from '../config.js';

const CONFIRMATIONS = 1;
const CONFIRM_TIMEOUT_MS = 120_000;
const BYTES32_HEX_LENGTH = 64;

// Cached after the first use, so we do not open new connections on every call
let cachedProvider = null;
let cachedReadContract = null;
let cachedWriteContract = null;

// Accepts a 32-byte hash with or without 0x and returns it as '0x' + 64 lowercase hex.
// This is the only place that converts hashes for the contract (Decision 26).
export function normalizeBytes32(value, name = 'value') {
  const text = String(value ?? '').trim();
  const hex = text.startsWith('0x') || text.startsWith('0X') ? text.slice(2) : text;
  const isValid = hex.length === BYTES32_HEX_LENGTH && /^[0-9a-fA-F]+$/.test(hex);
  if (!isValid) {
    throw new Error(`${name} must be 64 hex characters (with or without 0x)`);
  }
  return `0x${hex.toLowerCase()}`;
}

// The API and the database use hashes without 0x (docs/api.md)
function stripPrefix(hex) {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

function readAbi() {
  const abiUrl = new URL('./abi.json', import.meta.url);
  const abi = JSON.parse(fs.readFileSync(abiUrl, 'utf8'));
  if (!Array.isArray(abi) || abi.length === 0) {
    throw new Error('server/chain/abi.json is empty: paste the contract ABI from Remix');
  }
  return abi;
}

// FallbackProvider with quorum 1: if one RPC does not answer, the next one is used
function getProvider() {
  if (cachedProvider) {
    return cachedProvider;
  }
  const urls = config.chain.rpcUrls;
  if (urls.length === 0) {
    throw new Error('RPC_URLS is empty: set at least one RPC URL in server/.env');
  }
  // With a known chainId ethers does not have to ask the node for the network each time
  const providers = urls.map((url) => {
    if (config.chain.chainId === null) {
      return new ethers.JsonRpcProvider(url);
    }
    return new ethers.JsonRpcProvider(url, config.chain.chainId, { staticNetwork: true });
  });
  cachedProvider = new ethers.FallbackProvider(providers, undefined, { quorum: 1 });
  return cachedProvider;
}

function requireContractAddress() {
  if (config.chain.contractAddress === '') {
    throw new Error('CONTRACT_ADDRESS is empty: set the deployed contract address in server/.env');
  }
  return config.chain.contractAddress;
}

function getReadContract() {
  if (!cachedReadContract) {
    cachedReadContract = new ethers.Contract(requireContractAddress(), readAbi(), getProvider());
  }
  return cachedReadContract;
}

function getWriteContract() {
  if (cachedWriteContract) {
    return cachedWriteContract;
  }
  if (config.chain.issuerPrivateKey === '') {
    throw new Error('ISSUER_PRIVATE_KEY is empty: set the BTU issuer wallet key in server/.env');
  }
  const wallet = new ethers.Wallet(config.chain.issuerPrivateKey, getProvider());
  cachedWriteContract = new ethers.Contract(requireContractAddress(), readAbi(), wallet);
  return cachedWriteContract;
}

// Waits for the confirmation. On timeout the tx may still land, so the error carries
// the txHash and the pipeline checks getRecord(codeHash) before sending again (Decision 25).
async function waitForConfirmation(tx) {
  let receipt;
  try {
    receipt = await tx.wait(CONFIRMATIONS, CONFIRM_TIMEOUT_MS);
  } catch (error) {
    if (error.code === 'TIMEOUT') {
      throw new Error(
        `Transaction not confirmed within ${CONFIRM_TIMEOUT_MS / 1000}s, txHash: ${tx.hash}`,
      );
    }
    throw error;
  }
  if (receipt.status !== 1) {
    throw new Error(`Transaction failed on chain, txHash: ${tx.hash}`);
  }
}

// Resolves only after the transaction is confirmed. Throws on revert, timeout or RPC failure.
export async function issue(codeHash, docHash, passportRef, version) {
  const contract = getWriteContract();
  const tx = await contract.issue(
    normalizeBytes32(codeHash, 'codeHash'),
    normalizeBytes32(docHash, 'docHash'),
    normalizeBytes32(passportRef, 'passportRef'),
    version,
  );
  await waitForConfirmation(tx);
  return { txHash: tx.hash };
}

// Returns null when this codeHash was never issued
export async function getRecord(codeHash) {
  const record = await getReadContract().getRecord(normalizeBytes32(codeHash, 'codeHash'));
  if (!record.exists) {
    return null;
  }
  return {
    docHash: stripPrefix(record.docHash),
    passportRef: stripPrefix(record.passportRef),
    version: Number(record.version),
    timestamp: Number(record.timestamp),
    exists: true,
  };
}

// Highest version issued for this passport, 0 if none
export async function latestVersion(passportRef) {
  const version = await getReadContract().latestVersion(normalizeBytes32(passportRef, 'passportRef'));
  return Number(version);
}

// Address of the BTU issuer wallet that is allowed to write
export async function issuer() {
  return getReadContract().issuer();
}
