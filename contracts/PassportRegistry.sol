// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Registry of issued passport PDFs. Stores hashes only, no personal data.
// Only the BTU issuer wallet can write; anyone can read.
contract PassportRegistry {
    struct Record {
        bytes32 docHash;     // SHA-256 of the final PDF
        bytes32 passportRef; // keccak256(passportId + salt), not the Passport ID itself
        uint32 version;
        uint64 timestamp;    // block time
        bool exists;
    }

    // Set once in the constructor, cannot change. Public = free getter issuer().
    address public immutable issuer;

    // codeHash (SHA-256 of the verification code) => record
    mapping(bytes32 => Record) private records;

    // passportRef => highest version issued so far (0 = nothing issued)
    mapping(bytes32 => uint32) public latestVersion;

    event PassportIssued(
        bytes32 indexed codeHash,
        bytes32 indexed passportRef,
        bytes32 docHash,
        uint32 version
    );

    constructor(address _issuer) {
        require(_issuer != address(0), "Issuer is zero address");
        issuer = _issuer;
    }

    function issue(
        bytes32 codeHash,
        bytes32 docHash,
        bytes32 passportRef,
        uint32 version
    ) external {
        require(msg.sender == issuer, "Only issuer");
        require(docHash != bytes32(0), "Empty docHash");
        require(passportRef != bytes32(0), "Empty passportRef");
        require(!records[codeHash].exists, "Code already used");
        // Versions must go 1, 2, 3... without gaps or repeats
        require(version == latestVersion[passportRef] + 1, "Wrong version");

        records[codeHash] = Record(docHash, passportRef, version, uint64(block.timestamp), true);
        latestVersion[passportRef] = version;

        emit PassportIssued(codeHash, passportRef, docHash, version);
    }

    // exists == false means this code was never issued (all other values are zero)
    function getRecord(bytes32 codeHash)
        external
        view
        returns (bytes32 docHash, bytes32 passportRef, uint32 version, uint64 timestamp, bool exists)
    {
        Record memory r = records[codeHash];
        return (r.docHash, r.passportRef, r.version, r.timestamp, r.exists);
    }
}
