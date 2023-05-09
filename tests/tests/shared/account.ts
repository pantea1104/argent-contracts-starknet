import { Account, CairoVersion, CallData, Contract, ec, hash, stark } from "starknet";
import { account, provider } from "./constants";
import { fundAccount } from "./devnetInteraction";
import { deployAndLoadContract } from "./lib";

async function deployOldAccount(
  proxyClassHash: string,
  oldArgentAccountClassHash: string,
  privateKey?: string,
): Promise<Account> {
  // stark.randomAddress() for testing purposes only. This is not safe in production!
  privateKey = privateKey || stark.randomAddress();
  const publicKey = ec.starkCurve.getStarkKey(privateKey);

  const constructorCalldata = CallData.compile({
    implementation: oldArgentAccountClassHash,
    selector: hash.getSelectorFromName("initialize"),
    calldata: CallData.compile({ signer: publicKey, guardian: "0" }),
  });

  const contractAddress = hash.calculateContractAddressFromHash(publicKey, proxyClassHash, constructorCalldata, 0);

  const accountToDeploy = new Account(provider, contractAddress, privateKey);
  await fundAccount(accountToDeploy.address);

  const { transaction_hash } = await accountToDeploy.deployAccount({
    classHash: proxyClassHash,
    constructorCalldata,
    contractAddress,
    addressSalt: publicKey,
  });
  await account.waitForTransaction(transaction_hash);
  return accountToDeploy;
}

async function deployAndLoadAccountContract(classHash: string, owner: number, guardian = 0): Promise<Contract> {
  return await deployAndLoadContract(classHash, { owner, guardian });
}

// TODO Can't do YET
async function deployAccount(argentAccountClassHash: string): Promise<Account> {
  const privateKey = stark.randomAddress();
  const publicKey = ec.starkCurve.getStarkKey(privateKey);

  const constructorCalldata = CallData.compile({ signer: publicKey, guardian: "0" });
  const contractAddress = hash.calculateContractAddressFromHash(
    publicKey,
    argentAccountClassHash,
    constructorCalldata,
    0,
  );

  const accountToDeploy = new Account(provider, contractAddress, privateKey);
  await fundAccount(accountToDeploy.address);

  const { transaction_hash } = await account.deployAccount({
    classHash: argentAccountClassHash,
    constructorCalldata,
    addressSalt: publicKey,
  });
  await account.waitForTransaction(transaction_hash);
  return accountToDeploy;
}

async function upgradeAccount(
  accountToUpgrade: Account,
  argentAccountClassHash: string,
  cairoVersion: CairoVersion = "0",
) {
  const { transaction_hash: transferTxHash } = await accountToUpgrade.execute(
    {
      contractAddress: accountToUpgrade.address,
      entrypoint: "upgrade",
      calldata: CallData.compile({ implementation: argentAccountClassHash, calldata: ["0"] }),
    },
    undefined,
    { cairoVersion },
  );
  await provider.waitForTransaction(transferTxHash);
}

// TODO tmp method (we can't deploy cairo1 account yet), it'll be shorter
async function getCairo1Account(
  proxyClassHash: string,
  oldArgentAccountClassHash: string,
  argentAccountClassHash: string,
): Promise<Account> {
  const accountToUpgrade = await deployOldAccount(proxyClassHash, oldArgentAccountClassHash);
  await upgradeAccount(accountToUpgrade, argentAccountClassHash);
  return accountToUpgrade;
}

// TODO tmp method (we can't deploy cairo1 account yet), it'll be shorter
async function deployCairo1AccountWithGuardian(
  proxyClassHash: string,
  oldArgentAccountClassHash: string,
  argentAccountClassHash: string,
  ownerPrivateKey: string,
  guardianPrivateKey: string,
): Promise<Account> {
  const account = await deployOldAccount(proxyClassHash, oldArgentAccountClassHash, ownerPrivateKey);
  const guardianPublicKey = ec.starkCurve.getStarkKey(guardianPrivateKey);
  await upgradeAccount(account, argentAccountClassHash);
  // Needs to be done aftewards otherwise can't upgrade without providing both owner signature and guardian signature
  // This will be changed later
  await account.execute(
    {
      contractAddress: account.address,
      entrypoint: "change_guardian",
      calldata: CallData.compile({ new_guardian: guardianPublicKey }),
    },
    undefined,
    { cairoVersion: "1" },
  );
  return account;
}

export {
  deployAccount,
  deployOldAccount,
  deployAndLoadAccountContract,
  upgradeAccount,
  getCairo1Account,
  deployCairo1AccountWithGuardian,
};
