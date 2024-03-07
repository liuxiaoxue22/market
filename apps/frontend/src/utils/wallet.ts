/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ApiPromise, WsProvider } from '@polkadot/api';
import {
  web3Accounts,
  web3Enable,
  web3FromSource,
} from '@polkadot/extension-dapp';
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import { type u128 } from '@polkadot/types';
import { formatBalance } from '@polkadot/util';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { BizError } from '../../../libs/error';

export class Wallet {
  endpoint!: string;
  accounts!: InjectedAccountWithMeta[];

  private api!: ApiPromise;

  constructor(endpoint?: string) {
    this.endpoint = endpoint ?? import.meta.env.VITE_POLKADOT_ENDPOINT;
  }

  /**
   * 连接钱包并获取账户授权
   */
  async open() {
    const extensions = await web3Enable('My cool dapp');
    if (extensions.length === 0) {
      throw new BizError({ code: 'NO_EXTENSION' });
    }
    const allAccounts = await web3Accounts();
    if (allAccounts.length === 0) {
      throw new BizError({ code: 'NO_ACCOUNT' });
    }
    this.accounts = allAccounts;
  }

  /**
   * 查询账户余额
   * @param address
   */
  async getBalance(address: string): Promise<u128> {
    await this.connect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const result = (await this.api.query.system.account(address)) as any;
    return result.data.free as u128;
  }

  /**
   * 签署铭文转账
   *
   * @param from 发送方地址
   * @param to 接收方地址
   * @param dotAmt 转账的 DOT 数量
   * @param inscribeTick 转账的铭文名称
   * @param inscribeAmt 转账的的铭文数量
   */
  async signTransferInscribe(
    from: string,
    to: string,
    dotAmt: string,
    inscribeTick: string,
    inscribeAmt: string,
  ): Promise<string> {
    const account = await this.request(from);
    const injected = await web3FromSource(account.meta.source);
    const tx1 = this.api.tx.balances.transferKeepAlive(to, dotAmt);
    const tx2 = this.api.tx.system.remarkWithEvent(
      `{"p":"dot-20","op":"transfer","tick":"${inscribeTick.toUpperCase()}","amt":${inscribeAmt}}`,
    );
    const transfer = this.api.tx.utility.batchAll([tx1, tx2]);
    try {
      const signedTransfer = await transfer.signAsync(from, {
        signer: injected.signer,
      });
      return signedTransfer.toHex();
    } catch (e) {
      if (e instanceof Error && e.message === 'Rejected by user') {
        throw new BizError({ code: 'USER_REJECTED' });
      }
      throw e;
    }
  }

  setAccountsFromJSON(accountsJSON: string) {
    this.accounts = JSON.parse(accountsJSON);
  }

  private async request(from: string): Promise<InjectedAccountWithMeta> {
    await this.connect();

    const account = this.accounts.find((account) => account.address === from);
    if (!account) {
      throw new BizError({ code: 'NO_ACCOUNT' });
    }

    return account;
  }

  private async connect() {
    if (this.api) {
      if (this.api.isConnected) {
        return;
      }
      await this.api.disconnect();
    }
    const provider = new WsProvider(this.endpoint);
    this.api = await ApiPromise.create({ provider });
  }
}

/**
 * 格式化成波卡主网钱包地址
 * @param address
 * @returns
 */
export function fmtAddress(address: string): string {
  return encodeAddress(decodeAddress(address), 0);
}

/**
 * 格式化成波卡代币数量
 */
export function fmtBalance(balance: u128): string {
  return formatBalance(balance, {
    withUnit: false,
    decimals: import.meta.env.VITE_POLKADOT_DECIMALS,
  });
}

/**
 * 从localstorage获取当前选中的的账号address
 */
export function getCurrentAccountAddress() {
  const accountsStr = localStorage.getItem('DotWalletAccounts');
  if (!accountsStr) {
    return '';
  }
  const accounts = JSON.parse(accountsStr) as InjectedAccountWithMeta[];
  const selectedAccountIndexStr = localStorage.getItem('selectedAccountIndex');
  if (!selectedAccountIndexStr) {
    return accounts[0].address;
  } else {
    return fmtAddress(accounts[parseInt(selectedAccountIndexStr)].address);
  }
}
