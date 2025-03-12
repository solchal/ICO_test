import { buildOnchainMetadata } from "./utils/jetton-helpers";
import {
    Blockchain,
    SandboxContract,
    TreasuryContract,
} from "@ton/sandbox";
import "@ton/test-utils";
import {
    Address,
    beginCell,
    toNano
} from "@ton/core";

// -------- Contract SDK --------
import {
    ICOwithJetton,
    Mint, TokenTransfer,
    SetupICO, UpdateICO,
    FinalizeICO
} from "./output/ICO_ICOwithJetton";
import {
    JettonDefaultWallet,
    TokenBurn
} from "./output/ICO_JettonDefaultWallet";

const jettonParams = {
    name: "Best Practice",
    description: "This is description of Test tact jetton",
    symbol: "XXXE",
    image: "https://play-lh.googleusercontent.com/ahJtMe0vfOlAu1XJVQ6rcaGrQBgtrEZQefHy7SXB7jpijKhu1Kkox90XDuH8RmcBOXNn",
};

let content = buildOnchainMetadata(jettonParams);
let max_supply = toNano(1234567898765); // Set the specific total supply in nano

describe("contract", () => {
    let blockchain: Blockchain;
    let token: SandboxContract<ICOwithJetton>;
    let jettonWallet: SandboxContract<JettonDefaultWallet>;
    let deployer: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        // Create content Cell

        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury("deployer");

        token = blockchain.openContract(await ICOwithJetton.fromInit(deployer.address, content, max_supply));

        // Send Transaction
        const deployResult = await token.send(deployer.getSender(), { value: toNano("10") }, "Mint: 100");
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: token.address,
            deploy: true,
            success: true,
        });

        const playerWallet = await token.getGetWalletAddress(deployer.address);
        jettonWallet = blockchain.openContract(await JettonDefaultWallet.fromAddress(playerWallet));
    });

    it("Setting up ICO is successfully", async () => {
        const SetupICO: SetupICO = {
            $$type: "SetupICO",
            price: toNano('1'),
            start_time: BigInt(0),
            end_time: BigInt(3 * 24 * 60 * 60),
            hard_cap: toNano(12345678)
        };
        const setupICOResult = await token.send(deployer.getSender(), { value: toNano("10") }, SetupICO);
        expect(setupICOResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: token.address,
            success: true,
        });

        const active = (await token.getIcoInfo()).active;
        const price = (await token.getIcoInfo()).price;
        const hard_cap = (await token.getIcoInfo()).hard_cap;
        const tokens_sold = (await token.getIcoInfo()).tokens_sold;
        const is_ongoing = (await token.getIcoInfo()).is_ongoing;

        expect(active).toEqual(true);
        expect(price).toEqual(toNano('1'));
        expect(hard_cap).toEqual(toNano(12345678));
        expect(tokens_sold).toEqual(BigInt(0));

        console.log('Is ongoing?', is_ongoing);

    });

    it("Updating ICO is successfully", async () => {

        const SetupICO: SetupICO = {
            $$type: "SetupICO",
            price: toNano('0.01'),
            start_time: BigInt(0),
            end_time: BigInt(3 * 24 * 60 * 60),
            hard_cap: toNano(12345678)
        };
        const setupICOResult = await token.send(deployer.getSender(), { value: toNano("10") }, SetupICO);
        expect(setupICOResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: token.address,
            success: true,
        });

        const UpdateICO: UpdateICO = {
            $$type: "UpdateICO",
            new_price: toNano('0.02'),
            new_end_time: BigInt(6 * 24 * 60 * 60)
        };
        const updateICOResult = await token.send(deployer.getSender(), { value: toNano("10") }, UpdateICO);
        expect(updateICOResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: token.address,
            success: true,
        });

        const price = (await token.getIcoInfo()).price;

        expect(price).toEqual(toNano('0.02'));
    });

    it("Finalizing ICO is successfully", async () => {

        const FinalizeICO: FinalizeICO = {
            $$type: "FinalizeICO",
            emergency: false,
        };
        const setupICOResult = await token.send(deployer.getSender(), { value: toNano("10") }, FinalizeICO);
        expect(setupICOResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: token.address,
            success: true,
        });

        const active = (await token.getIcoInfo()).active;

        expect(active).toEqual(false);
    });

    it("Buying token is successfully", async () => {

        const SetupICO: SetupICO = {
            $$type: "SetupICO",
            price: toNano('0.01'),
            start_time: BigInt(0),
            end_time: BigInt(3 * 24 * 60 * 60),
            hard_cap: toNano(12345678)
        };
        await token.send(deployer.getSender(), { value: toNano("10") }, SetupICO);

        const receiver = await blockchain.treasury("investor");

        await token.send(receiver.getSender(), { value: toNano("10") }, null);

        const receiverWalletAddress = await token.getGetWalletAddress(receiver.address);
        const receiverWallet = blockchain.openContract(JettonDefaultWallet.fromAddress(receiverWalletAddress));

        const receiverWalletData = await receiverWallet.getGetWalletData();

        expect(receiverWalletData.balance).toBeGreaterThanOrEqual(toNano('900'));
    });

    it("Minting is successfully", async () => {
        const totalSupplyBefore = (await token.getGetJettonData()).total_supply;
        const mintAmount = toNano(100);
        const Mint: Mint = {
            $$type: "Mint",
            amount: mintAmount,
            receiver: deployer.address,
        };
        const mintResult = await token.send(deployer.getSender(), { value: toNano("10") }, Mint);
        expect(mintResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: token.address,
            success: true,
        });
        // printTransactionFees(mintResult.transactions);

        const totalSupplyAfter = (await token.getGetJettonData()).total_supply;
        expect(totalSupplyBefore + mintAmount).toEqual(totalSupplyAfter);

        const walletData = await jettonWallet.getGetWalletData();
        expect(walletData.owner).toEqualAddress(deployer.address);
        expect(walletData.balance).toBeGreaterThanOrEqual(mintAmount);
    });

    it("Should transfer successfully", async () => {
        const sender = await blockchain.treasury("sender");
        const receiver = await blockchain.treasury("receiver");
        const initMintAmount = toNano(1000);
        const transferAmount = toNano(80);

        const mintMessage: Mint = {
            $$type: "Mint",
            amount: initMintAmount,
            receiver: sender.address,
        };
        await token.send(deployer.getSender(), { value: toNano("0.25") }, mintMessage);

        const senderWalletAddress = await token.getGetWalletAddress(sender.address);
        const senderWallet = blockchain.openContract(JettonDefaultWallet.fromAddress(senderWalletAddress));

        // Transfer tokens from sender's wallet to receiver's wallet // 0xf8a7ea5
        const transferMessage: TokenTransfer = {
            $$type: "TokenTransfer",
            query_id: 0n,
            amount: transferAmount,
            sender: receiver.address,
            response_destination: sender.address,
            custom_payload: null,
            forward_ton_amount: toNano("0.1"),
            forward_payload: beginCell().storeUint(0, 1).storeUint(0, 32).endCell(),
        };
        const transferResult = await senderWallet.send(sender.getSender(), { value: toNano("0.5") }, transferMessage);
        expect(transferResult.transactions).toHaveTransaction({
            from: sender.address,
            to: senderWallet.address,
            success: true,
        });
        // printTransactionFees(transferResult.transactions);
        // prettyLogTransactions(transferResult.transactions);

        const receiverWalletAddress = await token.getGetWalletAddress(receiver.address);
        const receiverWallet = blockchain.openContract(JettonDefaultWallet.fromAddress(receiverWalletAddress));

        const senderWalletDataAfterTransfer = await senderWallet.getGetWalletData();
        const receiverWalletDataAfterTransfer = await receiverWallet.getGetWalletData();

        expect(senderWalletDataAfterTransfer.balance).toEqual(initMintAmount - transferAmount); // check that the sender transferred the right amount of tokens
        expect(receiverWalletDataAfterTransfer.balance).toEqual(transferAmount); // check that the receiver received the right amount of tokens
        // const balance1 = (await receiverWallet.getGetWalletData()).balance;
        // console.log(fromNano(balance1));
    });

    it("Mint tokens then Burn tokens", async () => {
        // const sender = await blockchain.treasury("sender");
        const deployerWalletAddress = await token.getGetWalletAddress(deployer.address);
        const deployerWallet = blockchain.openContract(JettonDefaultWallet.fromAddress(deployerWalletAddress));
        let deployerBalanceInit = (await deployerWallet.getGetWalletData()).balance;

        const initMintAmount = toNano(100);
        const mintMessage: Mint = {
            $$type: "Mint",
            amount: initMintAmount,
            receiver: deployer.address,
        };
        await token.send(deployer.getSender(), { value: toNano("10") }, mintMessage);
        let deployerBalance = (await deployerWallet.getGetWalletData()).balance;
        expect(deployerBalance).toEqual(deployerBalanceInit + initMintAmount);

        let burnAmount = toNano(10);
        const burnMessage: TokenBurn = {
            $$type: "TokenBurn",
            query_id: 0n,
            amount: burnAmount,
            response_destination: deployer.address,
            custom_payload: beginCell().endCell(),
        };

        await deployerWallet.send(deployer.getSender(), { value: toNano("10") }, burnMessage);
        let deployerBalanceAfterBurn = (await deployerWallet.getGetWalletData()).balance;
        expect(deployerBalanceAfterBurn).toEqual(deployerBalance - burnAmount);
    });

    it("Should return value", async () => {
        const player = await blockchain.treasury("player");
        const mintAmount = 1119000n;
        const Mint: Mint = {
            $$type: "Mint",
            amount: mintAmount,
            receiver: player.address,
        };
        await token.send(deployer.getSender(), { value: toNano("1") }, Mint);

        let totalSupply = (await token.getGetJettonData()).total_supply;
        const messateResult = await token.send(player.getSender(), { value: 10033460n }, Mint);
        expect(messateResult.transactions).toHaveTransaction({
            from: player.address,
            to: token.address,
        });
        let totalSupply_later = (await token.getGetJettonData()).total_supply;
        expect(totalSupply_later).toEqual(totalSupply);
    });

    it("Convert Address Format", async () => {
        console.log("Example Address(Jetton Root Contract: " + token.address);
        console.log("Is Friendly Address: " + Address.isFriendly(token.address.toString()));

        const testAddr = Address.parse(token.address.toString());
        console.log("✓ Address: " + testAddr.toString({ bounceable: false }));
        console.log("✓ Address: " + testAddr.toString());
        console.log("✓ Address(urlSafe: true): " + testAddr.toString({ urlSafe: true }));
        console.log("✓ Address(urlSafe: false): " + testAddr.toString({ urlSafe: false }));
        console.log("✓ Raw Address: " + testAddr.toRawString());
    });
});

