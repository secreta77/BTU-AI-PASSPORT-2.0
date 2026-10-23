import { Injectable, inject } from '@angular/core';
import { PASSPORT_REGISTRY_ABI } from '../chain/passport-registry.abi';
import { ISSUER_FILE_URL } from '../constants';
import { ChainCheck, IssuerFile, VerifyInfo } from '../models/verify.model';
import { HashService } from './hash.service';

type Ethers = typeof import('ethers');

// Reads the contract straight from the browser (no database, no BTU server).
// ethers is loaded with a dynamic import, so it is a separate chunk and only loads here.
@Injectable({ providedIn: 'root' })
export class ChainVerifyService {
  private readonly hashService = inject(HashService);

  async check(info: VerifyInfo): Promise<ChainCheck> {
    const ethers = await import('ethers');
    // Same formula as the server: sha256 of the code text, hex without 0x
    const codeHash = await this.hashService.sha256Hex(info.verificationCode);
    const expectedIssuer = await this.loadExpectedIssuer();

    // Try the public RPC URLs one by one (Decision 4)
    let lastError: unknown = new Error('No RPC URL');
    for (const rpcUrl of info.chain.rpcUrls) {
      try {
        return await this.readFromRpc(ethers, rpcUrl, info, codeHash, expectedIssuer);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private async loadExpectedIssuer(): Promise<IssuerFile> {
    const response = await fetch(ISSUER_FILE_URL);
    if (!response.ok) {
      throw new Error('Issuer file not found');
    }
    return (await response.json()) as IssuerFile;
  }

  private async readFromRpc(
    ethers: Ethers,
    rpcUrl: string,
    info: VerifyInfo,
    codeHash: string,
    expectedIssuer: IssuerFile,
  ): Promise<ChainCheck> {
    // staticNetwork: no extra "which network?" request before each call
    const provider = new ethers.JsonRpcProvider(rpcUrl, info.chain.chainId, {
      staticNetwork: true,
    });
    try {
      const contract = new ethers.Contract(
        info.chain.contractAddress,
        PASSPORT_REGISTRY_ABI,
        provider,
      );
      const record = await contract['getRecord']('0x' + codeHash);
      if (!record.exists) {
        return { recordExists: false };
      }
      const latestVersion = Number(await contract['latestVersion'](record.passportRef));
      const chainIssuer: string = await contract['issuer']();
      const version = Number(record.version);

      return {
        recordExists: true,
        docHash: String(record.docHash).replace(/^0x/, '').toLowerCase(),
        version,
        latestVersion,
        isLatest: version === latestVersion,
        versionMatchesDatabase: version === info.version,
        issuerMatches:
          chainIssuer.toLowerCase() === expectedIssuer.issuer.toLowerCase() &&
          expectedIssuer.chainId === info.chain.chainId,
      };
    } finally {
      provider.destroy();
    }
  }
}
