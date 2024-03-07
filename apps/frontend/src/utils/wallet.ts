/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ApiPromise, WsProvider } from '@polkadot/api';
import {
  web3Accounts,
  web3Enable,
  web3FromSource,
} from '@polkadot/extension-dapp';
import type { InjectedAccountWithMeta, InjectedExtension } from '@polkadot/extension-inject/types';
import { buildInscribeTransfer } from 'apps/libs/util';
import { Decimal } from 'decimal.js';
import { BizError } from '../../../libs/error';

export class Wallet {
  endpoint!: string;
  accounts!: InjectedAccountWithMeta[];

  api!: ApiPromise;

  constructor(endpoint?: string) {
    this.endpoint = endpoint ?? import.meta.env.VITE_POLKADOT_ENDPOINT;
  }

  /**
   * 连接钱包并获取账户授权
   */
  async open() {
    const extensions = await web3Enable('DOT-20 Market');
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
  async getBalance(address: string): Promise<Decimal> {
    await this.connect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const result = (await this.api.query.system.account(address)) as any;
    return new Decimal(result.data.free.toString());
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
    dotAmt: Decimal,
    inscribeTick: string,
    inscribeAmt: number,
  ): Promise<string> {
    const injected = await this.request(from);
    const tx1 = this.api.tx.balances.transferKeepAlive(to, dotAmt.toFixed());
    const tx2 = this.api.tx.system.remarkWithEvent(buildInscribeTransfer(inscribeTick, inscribeAmt));
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

  private async request(from: string): Promise<InjectedExtension> {
    await this.connect();

    const account = this.accounts.find((account) => account.address === from);
    if (!account) {
      throw new BizError({ code: 'NO_ACCOUNT' });
    }

    return await web3FromSource(account.meta.source);
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
