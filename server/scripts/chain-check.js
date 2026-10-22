// Read-only check of the contract connection: no private key is used.
// Run from any folder: npm run chain-check (in server/)
import { ethers } from 'ethers';
import { config } from '../config.js';
import * as chainService from '../chain/chainService.js';

// A made-up reference, not a real passport
const TEST_PASSPORT_REF = ethers.id('chain-check-test');

async function main() {
  console.log('Contract:', config.chain.contractAddress || '(empty)');
  console.log('Issuer:', await chainService.issuer());
  console.log('latestVersion(test ref):', await chainService.latestVersion(TEST_PASSPORT_REF));
}

main().catch((error) => {
  console.error('chain-check failed:', error.message);
  process.exitCode = 1;
});
