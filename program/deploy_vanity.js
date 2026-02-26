/**
 * Deploy Aureus program to vanity address derived via createWithSeed.
 *
 * Usage:
 *   node deploy_vanity.js [devnet|mainnet-beta]
 *
 * Prerequisites:
 *   - Solana CLI configured with the base keypair (~/.config/solana/id.json)
 *   - Program binary built at target/deploy/aureus.so
 *
 * Vanity derivation:
 *   base:  8JWwWhAndW8Fac9Xmy7viMzq6TEJaGwyjb4dAtc5JvW8
 *   seed:  "3VqlwhnYzhZ0S4vg"
 *   owner: BPFLoaderUpgradeab1e11111111111111111111111
 *   →      AUREUSc1eS3QsCDJoAHUUimHq61gcMUFLBDRaYzdDTmh
 */

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  BpfLoader,
} = require("@solana/web3.js");
const fs = require("fs");
const { execSync } = require("child_process");

// === Config ===
const CLUSTER = process.argv[2] || "devnet";
const RPC_URLS = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};
const RPC_URL = RPC_URLS[CLUSTER] || RPC_URLS.devnet;

const BASE_SEED = "3VqlwhnYzhZ0S4vg";
const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const EXPECTED_PROGRAM_ID = new PublicKey(
  "AUREUSc1eS3QsCDJoAHUUimHq61gcMUFLBDRaYzdDTmh",
);
const PROGRAM_SO = "./target/deploy/aureus.so";

async function main() {
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log(`║  🏛️  AUREUS VANITY DEPLOY → ${CLUSTER.padEnd(20)} ║`);
  console.log("╚═══════════════════════════════════════════════════╝");

  // Load payer/base keypair
  const walletData = JSON.parse(
    fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8"),
  );
  const payer = Keypair.fromSecretKey(Uint8Array.from(walletData));
  console.log(`\nBase/Payer: ${payer.publicKey.toBase58()}`);

  // Verify the derivation
  const derivedAddr = await PublicKey.createWithSeed(
    payer.publicKey,
    BASE_SEED,
    BPF_LOADER_UPGRADEABLE,
  );
  console.log(`Derived:    ${derivedAddr.toBase58()}`);
  console.log(`Expected:   ${EXPECTED_PROGRAM_ID.toBase58()}`);

  if (!derivedAddr.equals(EXPECTED_PROGRAM_ID)) {
    console.error(
      "\n❌ Derivation mismatch! Your wallet doesn't match the base key.",
    );
    console.error(`   Your wallet: ${payer.publicKey.toBase58()}`);
    console.error(
      `   Expected base: 8JWwWhAndW8Fac9Xmy7viMzq6TEJaGwyjb4dAtc5JvW8`,
    );
    process.exit(1);
  }
  console.log(`✅ Derivation verified!\n`);

  // Check program binary
  if (!fs.existsSync(PROGRAM_SO)) {
    console.error(`❌ Program binary not found: ${PROGRAM_SO}`);
    console.error(`   Run: cargo build-sbf`);
    process.exit(1);
  }
  const programData = fs.readFileSync(PROGRAM_SO);
  console.log(`Program binary: ${(programData.length / 1024).toFixed(1)} KB`);

  const connection = new Connection(RPC_URL, "confirmed");
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Payer balance: ${(balance / 1e9).toFixed(4)} SOL on ${CLUSTER}`);

  // Check if program already exists
  const existingAccount = await connection.getAccountInfo(EXPECTED_PROGRAM_ID);

  if (existingAccount) {
    console.log(`\n📦 Program account already exists!`);
    console.log(`   Owner: ${existingAccount.owner.toBase58()}`);
    console.log(`   Size: ${existingAccount.data.length} bytes`);

    if (existingAccount.owner.equals(BPF_LOADER_UPGRADEABLE)) {
      console.log(`\n🔄 Program already deployed — upgrading via CLI...`);
      // Use solana CLI to upgrade (it handles buffer + upgrade atomically)
      const cmd = `solana program deploy ${PROGRAM_SO} --program-id ${EXPECTED_PROGRAM_ID.toBase58()} --url ${RPC_URL} --keypair ~/.config/solana/id.json`;
      console.log(`   $ ${cmd}\n`);
      try {
        execSync(cmd, { stdio: "inherit" });
        console.log(`\n✅ Program upgraded successfully!`);
      } catch (e) {
        console.error(`\n❌ Upgrade failed:`, e.message);
        process.exit(1);
      }
      return;
    }
  }

  // === Fresh deploy flow ===
  console.log(`\n🚀 Fresh deploy to vanity address...`);

  // Step 1: Write buffer using CLI (handles chunking automatically)
  console.log(`\n📝 Step 1: Writing program to buffer...`);
  let bufferAddr;
  try {
    const result = execSync(
      `solana program write-buffer ${PROGRAM_SO} --url ${RPC_URL} --keypair ~/.config/solana/id.json --output json`,
      { encoding: "utf8" },
    );
    // Parse the buffer address from output
    const parsed = JSON.parse(result);
    bufferAddr = parsed.buffer;
    if (!bufferAddr) {
      // Try alternate parse
      const match = result.match(/Buffer: (\w+)/);
      bufferAddr = match ? match[1] : null;
    }
    console.log(`   Buffer: ${bufferAddr}`);
  } catch (e) {
    // Try parsing from stderr/stdout
    const output = e.stdout?.toString() || e.stderr?.toString() || "";
    const match = output.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (match) {
      bufferAddr = match[1];
      console.log(`   Buffer: ${bufferAddr}`);
    } else {
      console.error(`❌ Failed to write buffer:`, output.slice(0, 500));
      process.exit(1);
    }
  }

  // Step 2: Get buffer info for sizing
  const bufferInfo = await connection.getAccountInfo(new PublicKey(bufferAddr));
  const programLen = bufferInfo.data.length;
  console.log(`   Buffer size: ${programLen} bytes`);

  // Step 3: Create program account at vanity address using CreateAccountWithSeed
  console.log(`\n🏗️  Step 2: Creating program account at vanity address...`);

  // The programdata account size: header (45 bytes) + program data
  // Program account itself is 36 bytes (4 byte enum + 32 byte programdata addr)
  const PROGRAM_ACCOUNT_SIZE = 36;
  const programdataSize = 45 + programLen * 2; // 2x for upgrade headroom

  const programRent =
    await connection.getMinimumBalanceForRentExemption(PROGRAM_ACCOUNT_SIZE);

  const createIx = SystemProgram.createAccountWithSeed({
    fromPubkey: payer.publicKey,
    newAccountPubkey: EXPECTED_PROGRAM_ID,
    basePubkey: payer.publicKey,
    seed: BASE_SEED,
    lamports: programRent,
    space: PROGRAM_ACCOUNT_SIZE,
    programId: BPF_LOADER_UPGRADEABLE,
  });

  try {
    const tx = new Transaction().add(createIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
    console.log(`   ✅ Program account created: ${sig}`);
  } catch (e) {
    if (e.message.includes("already in use")) {
      console.log(`   ⚠️  Account already exists, continuing...`);
    } else {
      console.error(`   ❌ Failed:`, e.message.slice(0, 300));
      process.exit(1);
    }
  }

  // Step 4: Deploy from buffer using CLI
  console.log(`\n🚀 Step 3: Deploying from buffer...`);
  try {
    execSync(
      `solana program deploy --buffer ${bufferAddr} --program-id ${EXPECTED_PROGRAM_ID.toBase58()} --url ${RPC_URL} --keypair ~/.config/solana/id.json`,
      { stdio: "inherit" },
    );
    console.log(`\n✅ Program deployed to ${EXPECTED_PROGRAM_ID.toBase58()}`);
  } catch (e) {
    console.error(
      `\n❌ Deploy failed. You may need to close the buffer and retry.`,
    );
    console.error(`   Buffer: ${bufferAddr}`);
    console.error(`   To recover SOL: solana program close ${bufferAddr}`);
    process.exit(1);
  }

  // Verify
  console.log(`\n📋 Verifying deployment...`);
  try {
    execSync(
      `solana program show ${EXPECTED_PROGRAM_ID.toBase58()} --url ${RPC_URL}`,
      { stdio: "inherit" },
    );
  } catch {}

  console.log(`\n╔═══════════════════════════════════════════════════╗`);
  console.log(`║  ✅ AUREUS deployed to vanity address!            ║`);
  console.log(`║  ${EXPECTED_PROGRAM_ID.toBase58()}  ║`);
  console.log(`╚═══════════════════════════════════════════════════╝`);
}

main().catch((err) => {
  console.error("\n❌ FATAL:", err);
  process.exit(1);
});
