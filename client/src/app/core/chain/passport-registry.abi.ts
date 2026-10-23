// Read-only part of the contract ABI. COPY of server/chain/abi.json (only the 3 view functions
// the browser needs). When the contract changes, update both files together (CLAUDE.md, Decision 30).
export const PASSPORT_REGISTRY_ABI = [
  'function getRecord(bytes32 codeHash) view returns (bytes32 docHash, bytes32 passportRef, uint32 version, uint64 timestamp, bool exists)',
  'function latestVersion(bytes32 passportRef) view returns (uint32)',
  'function issuer() view returns (address)',
];
