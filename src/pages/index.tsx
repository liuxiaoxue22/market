import {
  Button,
  Link,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
} from "@nextui-org/react";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import Head from "next/head";
import { api } from "~/utils/api";

export default function Home() {
  const hello = api.post.hello.useQuery({ text: "from tRPC" });
  const create = api.order.create.useMutation();

  async function handleClick() {
    const { web3Enable, web3Accounts, web3FromSource } = await import(
      "@polkadot/extension-dapp"
    );
    const extensions = await web3Enable("My cool dapp");
    console.log(extensions);
    if (extensions.length === 0) {
      console.log("no extension installed");
      return;
    }
    const allAccounts = await web3Accounts();
    if (allAccounts.length === 0) {
      console.log("no extension installed");
      return;
    }
    console.log(allAccounts);

    const injected = await web3FromSource(allAccounts[0].meta.source ?? "");
    console.log(injected);

    const encode = decodeAddress(allAccounts[0].address);
    console.log(encodeAddress(encode, 0));

    const wsProvider = new WsProvider("wss://westend-rpc.polkadot.io");
    const apiPromise = await ApiPromise.create({ provider: wsProvider });

    const senderAddress = "5Fv3d8YgdM1wx3xAnj4jkCA7Tm1oR7UZipLnCynVLbBT7vGZ";
    const recipientAddress = "5GBRPdwiDdSG5EKn1Zec3mw7umogG23aP2YDDjEhGvFdPNeQ";
    const transferAmount = 0; // amount in Planck

    // create the transaction
    const transfer = apiPromise.tx.balances.transferKeepAlive(
      recipientAddress,
      transferAmount,
    );

    // sign the transaction
    const signedTransfer = await transfer.signAsync(senderAddress, {
      signer: injected.signer,
    });

    console.log("Signed transfer:", signedTransfer.toJSON());

    // now you can send `signedTransfer` to a third party, who can submit it to the chain
    const serializedTransfer = signedTransfer.toHex();
    console.log("Serialized signed transfer:", serializedTransfer);

    const resp = await create.mutateAsync({
      from: senderAddress + "asd",
      signedTransfer: serializedTransfer,
    });
    console.log(resp);
  }

  return (
    <>
      <Head>
        <title>Create T3 App</title>
        <meta name="description" content="Generated by create-t3-app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div>
        <Navbar>
          <NavbarBrand>
            <p className="font-bold text-inherit">ACME23</p>
          </NavbarBrand>
          <NavbarContent className="hidden gap-4 sm:flex" justify="center">
            <NavbarItem>
              <Link color="foreground" href="#">
                Features
              </Link>
            </NavbarItem>
            <NavbarItem isActive>
              <Link href="#" aria-current="page">
                Customers
              </Link>
            </NavbarItem>
            <NavbarItem>
              <Link color="foreground" href="#">
                Integrations
              </Link>
            </NavbarItem>
          </NavbarContent>
          <NavbarContent justify="end">
            <NavbarItem className="hidden lg:flex">
              <Link href="#">Login</Link>
            </NavbarItem>
            <NavbarItem>
              <Button as={Link} color="primary" href="#" variant="flat">
                Sign Up
              </Button>
            </NavbarItem>
          </NavbarContent>
        </Navbar>
        <button className="btn w-64" onClick={handleClick}>
          Button
        </button>
        <p className="text-2xl text-white">
          {hello.data ? hello.data.greeting : "Loading tRPC query..."}
        </p>
      </div>
    </>
  );
}
