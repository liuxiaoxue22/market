import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Image,
  Link,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
} from '@nextui-org/react';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { useGlobalStateStore } from '@GlobalState';
import { assertError } from '@utils/trpc';
import { fmtAddress } from 'apps/libs/util';
import { useEffect, useState } from 'react';
import { IoWalletOutline } from 'react-icons/io5';
import { RiArrowDropDownLine, RiMoneyDollarCircleLine } from 'react-icons/ri';
import { Link as Linkto, Outlet } from 'react-router-dom';
import { toast } from 'react-toastify';
import { desensitizeAddress, wallet } from '../utils/wallet';

export function Layout() {
  const { account, setAccount, accounts, setAccounts } = useGlobalStateStore();
  const [connectLoading, setConnectLoading] = useState(false);

  useEffect(() => {
    void loadAccounts();
  }, []);

  async function loadAccounts() {
    // 如果已经连接钱包，直接通过钱包扩展获取账户列表
    if (account) {
      await wallet.open();
      setAccounts(wallet.accounts);
    }
  }

  async function handleConnect() {
    setConnectLoading(true);
    try {
      await wallet.open();
      setAccounts(wallet.accounts);
      setAccount(wallet.accounts[0].address);
    } catch (e) {
      console.error(e);
      const err = assertError(e);
      if (err.code === 'NO_EXTENSION') {
        toast.warn('No wallet extension found');
        return;
      }
      if (err.code === 'NO_ACCOUNT') {
        toast.warn('Please select an account in the wallet');
        return;
      }
      toast.error(err.code);
    } finally {
      setConnectLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar
        position="static"
        isBordered
        className="bg-background/70 pl-2 pr-2"
        maxWidth="full"
      >
        <NavbarBrand>
          <Image src="/logo.svg" alt="logo" width={120} height={40} />
        </NavbarBrand>
        <NavbarContent className="hidden gap-12 md:flex" justify="center">
          <NavbarItem isActive={location.pathname === '/market'}>
            <Link
              href="/market"
              color={location.pathname === '/market' ? 'primary' : 'foreground'}
            >
              MARKETPLACE
            </Link>
          </NavbarItem>
          <NavbarItem isActive={location.pathname === '/cross-chain'}>
            <Link
              href="/cross-chain"
              color={
                location.pathname === '/cross-chain' ? 'primary' : 'foreground'
              }
            >
              CROSS-CHAIN
            </Link>
          </NavbarItem>
          <NavbarItem>
            <Link
              color="foreground"
              href="https://dota.fyi/inscribe/"
              target="_blank"
            >
              INSCRIBE
            </Link>
          </NavbarItem>
        </NavbarContent>
        <NavbarContent justify="end">
          <NavbarItem className="hidden md:flex">
            <a href="https://twitter.com/JayPlayDota" target="_blank">
              <img
                color="red"
                alt="twitter"
                loading="lazy"
                width="32"
                height="32"
                decoding="async"
                data-nimg="1"
                src="/twitter.svg"
              />
            </a>
          </NavbarItem>
          <NavbarItem className="hidden md:flex">
            <a href="https://t.me/+R11nMCkuUZ0zN2M1" target="_blank">
              <img
                alt="telegram"
                loading="lazy"
                width="28"
                height="28"
                decoding="async"
                data-nimg="1"
                src="/tg.svg"
              />
            </a>
          </NavbarItem>
          <NavbarItem className="hidden md:flex">
            <a href="https://github.com/dot20-community" target="_blank">
              <img
                alt="github"
                loading="lazy"
                width="32"
                height="32"
                decoding="async"
                data-nimg="1"
                src="/github.svg"
              />
            </a>
          </NavbarItem>
          <NavbarItem>
            {account ? (
              <Dropdown>
                <DropdownTrigger>
                  <Button
                    startContent={<IoWalletOutline size={24} />}
                    endContent={<RiArrowDropDownLine size={24} />}
                    variant="shadow"
                    className="capitalize"
                    color="primary"
                    radius="full"
                  >
                    {desensitizeAddress(account)}
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="Single selection example"
                  variant="flat"
                  color="primary"
                  disallowEmptySelection
                  selectionMode="single"
                  selectedKeys={[account]}
                  onSelectionChange={(keys) => {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    const currentKey = keys['currentKey'] as string;
                    if (currentKey === 'disconnect') {
                      setAccounts([]);
                      setAccount(undefined);
                    } else {
                      setAccount(currentKey);
                    }
                  }}
                >
                  {[
                    ...accounts.map((account, index) => {
                      const address = fmtAddress(account.address);
                      return (
                        <DropdownItem
                          color="primary"
                          key={address}
                          showDivider={index == accounts.length - 1}
                        >{`${account.meta.name} [${desensitizeAddress(
                          address,
                        )}]`}</DropdownItem>
                      );
                    }),
                    <DropdownItem color="primary" key="disconnect">
                      Disconnect
                    </DropdownItem>,
                  ]}
                </DropdownMenu>
              </Dropdown>
            ) : (
              <Button
                color="primary"
                variant="shadow"
                radius="full"
                className="text-large"
                isLoading={connectLoading}
                onClick={handleConnect}
              >
                Connect Wallet
              </Button>
            )}
          </NavbarItem>
          <NavbarItem>
            <Linkto to="/account">
              <Button isIconOnly color="primary" aria-label="Balance">
                <RiMoneyDollarCircleLine size={24} />
              </Button>
            </Linkto>
          </NavbarItem>
        </NavbarContent>
      </Navbar>
      {/*     <div className="py-1 w-full bg-stone-600 flex justify-center ">
        Maket is being upgraded for AssetHub $DOTA, will be back soon.
      </div> */}

      <main className="flex-grow">
        <Outlet />
      </main>

      <footer className="inset-x-0 bottom-0 pm-4 pt-24">
        <div className="flex gap-6 justify-center">
          <a href="https://twitter.com/JayPlayDota" target="_blank">
            <img
              alt="twitter"
              loading="lazy"
              width="32"
              height="32"
              decoding="async"
              data-nimg="1"
              src="/twitter.svg"
            />
          </a>
          <a href="https://t.me/+R11nMCkuUZ0zN2M1" target="_blank">
            <img
              alt="telegram"
              loading="lazy"
              width="28"
              height="28"
              decoding="async"
              data-nimg="1"
              src="/tg.svg"
            />
          </a>
          <a href="https://github.com/dot20-community" target="_blank">
            <img
              alt="github"
              loading="lazy"
              width="32"
              height="32"
              decoding="async"
              data-nimg="1"
              src="/github.svg"
            />
          </a>
        </div>
        <div className="flex justify-center">
          <img
            alt="Secured by PolkaDot"
            loading="lazy"
            width="385"
            height="50"
            decoding="async"
            data-nimg="1"
            src="/dot_copyright.svg"
          />
        </div>
      </footer>
    </div>
  );
}
