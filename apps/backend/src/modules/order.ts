import { Order, Status } from '@prisma/client';
import { BizError } from 'apps/libs/error';
import {
  dot2Planck,
  parseBatchTransfer,
  parseInscribeTransfer,
} from 'apps/libs/util';
import Decimal from 'decimal.js';
import { LRUCache } from 'lru-cache';
import { PageReq, PageRes, noAuthProcedure, router } from '../server/trpc';
import { submitAndWaitExtrinsic } from '../util/dapp';

/**
 * 卖单请求参数
 */
export type SellReq = {
  /**
   * 卖家地址
   */
  seller: string;
  /**
   * 铭文出售总价
   */
  totalPrice: string;
  /**
   * 服务费
   */
  serviceFee: string;
  /**
   * 签名交易数据
   */
  signedExtrinsic: string;
};
/**
 * 卖单响应参数
 */
export type SellRes = {
  /**
   * 订单ID
   */
  id: bigint;
  /**
   * 交易哈希
   */
  hash: string;
};

/**
 * 查询订单详情请求参数
 */
export type DetailReq = number;
/**
 * 查询订单详情响应参数
 */
export type DetailRes = Order;

/**
 * 查询订单列表请求参数
 */
export type ListReq = PageReq & {
  /**
   * 卖家地址过滤条件
   */
  seller?: string;
  /**
   * 订单状态列表过滤条件，为空时查询所有状态
   */
  statues?: Status[];
};
/**
 * 查询订单列表响应参数
 */
export type ListRes = PageRes<Order>;

/**
 * 买单请求参数
 */
export type BuyReq = {
  /**
   * 订单ID
   */
  id: number;
  /**
   * 买家地址
   */
  buyer: string;
  /**
   * 签名交易数据
   */
  signedExtrinsic: string;
};
/**
 * 买单响应参数
 */
export type BuyRes = {
  /**
   * 订单ID
   */
  id: number;
  /**
   * 交易哈希
   */
  hash: string;
};

const cache = new LRUCache<string, any>({
  ttl: 1000 * 60 * 60, // 1小时
  ttlAutopurge: true,
});

export const orderRouter = router({
  /**
   * 获取dot价格(单位：美元)
   */
  dotPrice: noAuthProcedure.query(async ({ ctx }): Promise<number> => {
    const key = 'dotPrice';
    const cachedPrice = cache.get(key);
    if (cachedPrice) {
      return cachedPrice;
    }
    const resp = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=polkadot&vs_currencies=usd',
    );
    const data = await resp.json();
    const price = data?.polkadot?.usd ?? 10;
    cache.set(key, price);
    return price;
  }),
  /**
   * 卖单
   */
  sell: noAuthProcedure
    .input((input) => input as SellReq)
    .mutation(async ({ input, ctx }): Promise<SellRes> => {
      const extrinsic = ctx.api.createType('Extrinsic', input.signedExtrinsic);
      const totalPriceDecimal = new Decimal(input.totalPrice);
      const serviceFeeDecimal = new Decimal(input.serviceFee);
      // 解析铭文转账数据
      const inscribeTransfer = parseInscribeTransfer(extrinsic as any);
      if (!inscribeTransfer) {
        throw BizError.of('INVALID_TRANSACTION', 'Invalid extrinsic format');
      }
      // 校验卖家地址是否与签名地址一致
      if (input.seller !== extrinsic.signer.toString()) {
        throw BizError.of(
          'INVALID_TRANSACTION',
          `Invalid seller: expect ${
            input.seller
          } but got ${extrinsic.signer.toString()}`,
        );
      }
      // 校验是否满足最小交易金额
      const minSellTotalPriceDecimal = dot2Planck(ctx.opts.minSellTotalPrice);
      if (totalPriceDecimal < minSellTotalPriceDecimal) {
        throw BizError.of(
          'INVALID_TRANSACTION',
          `Invalid total price: at least ${minSellTotalPriceDecimal} Planck but got ${totalPriceDecimal}`,
        );
      }
      // 检查是否转账给平台地址
      if (inscribeTransfer.to !== ctx.opts.marketAccount) {
        throw BizError.of(
          'INVALID_TRANSACTION',
          `Invalid receiver address: expect ${ctx.opts.marketAccount} but got ${inscribeTransfer.to}`,
        );
      }
      // 检查转账金额是否符合
      const needPayPrice = totalPriceDecimal.add(serviceFeeDecimal);
      const realTransferPrice = inscribeTransfer.value;
      if (realTransferPrice < needPayPrice) {
        throw BizError.of(
          'INVALID_TRANSACTION',
          `Invalid transfer amount: expect at least ${needPayPrice} Planck but got ${realTransferPrice}`,
        );
      }

      const now = new Date();
      // 存储到数据库
      const order = await ctx.prisma.order.create({
        data: {
          seller: input.seller,
          totalPrice: BigInt(totalPriceDecimal.toFixed()),
          buyServiceFee: BigInt(serviceFeeDecimal.toFixed()),
          buyRealPayPrice: BigInt(realTransferPrice.toFixed()),
          buyHash: extrinsic.hash.toString(),
          tick: inscribeTransfer.inscribeTick,
          amount: inscribeTransfer.inscribeAmt,
          createdAt: now,
          updatedAt: now,
        },
      });

      // 提交上链
      const errMsg = await submitAndWaitExtrinsic(ctx.api, extrinsic as any);
      if (errMsg) {
        // 更新订单状态为FAILED
        await ctx.prisma.order.update({
          where: {
            id: order.id,
          },
          data: {
            status: 'FAILED',
            chainStatus: 'SELL_BLOCK_FAILED',
            failReason: errMsg,
            updatedAt: now,
          },
        });
        throw BizError.of('TRANSFER_FAILED', errMsg);
      }

      // 更新订单子状态为区块已确认
      await ctx.prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          chainStatus: 'SELL_BLOCK_CONFIRMED',
          updatedAt: now,
        },
      });

      return { id: order.id, hash: extrinsic.hash.toHex() };
    }),
  /**
   * 查询订单信息
   */
  detail: noAuthProcedure
    .input((input) => input as DetailReq)
    .query(async ({ input, ctx }): Promise<DetailRes> => {
      const order = await ctx.prisma.order.findUnique({
        where: {
          id: input,
        },
      });
      if (!order) {
        throw BizError.of('ORDER_NOT_FOUND');
      }
      return order;
    }),
  /**
   * 查询订单列表
   */
  list: noAuthProcedure
    .input((input) => input as ListReq)
    .query(async ({ input, ctx }): Promise<ListRes> => {
      const list = await ctx.prisma.order.findMany({
        take: input.limit + 1, // get an extra item at the end which we'll use as next cursor
        where: {
          seller: input.seller ? { equals: input.seller } : undefined,
          status: {
            in: input.statues,
          },
        },
        cursor: input.cursor ? { id: BigInt(input.cursor) } : undefined,
        orderBy: {
          id: 'desc',
        },
      });

      const nextCursor =
        list.length > input.limit ? list.pop()?.id.toString() : undefined;
      const prevCursor = list.length > 0 ? list[0].id.toString() : undefined;
      return {
        total: list.length,
        list,
        prev: prevCursor,
        next: nextCursor,
      };
    }),
  /**
   * 买单
   */
  buy: noAuthProcedure
    .input((input) => input as BuyReq)
    .mutation(async ({ input, ctx }): Promise<BuyRes> => {
      const extrinsic = ctx.api.createType('Extrinsic', input.signedExtrinsic);
      // 查询订单信息
      const order = await ctx.prisma.order.findUnique({
        where: {
          id: input.id,
        },
      });
      if (!order) {
        throw BizError.of('ORDER_NOT_FOUND');
      }
      // 校验是否为合法的转账交易
      const batchTransfer = parseBatchTransfer(extrinsic as any);
      if (!batchTransfer) {
        throw BizError.of('INVALID_TRANSACTION', 'Invalid extrinsic format');
      }
      // 检查是否转账给卖家地址
      const transferToSeller = batchTransfer.list.filter(
        (transfer) => transfer.to === order.seller,
      )[0];
      if (!transferToSeller) {
        throw BizError.of(
          'INVALID_TRANSACTION',
          `Invalid receiver address: not found seller address ${order.seller}`,
        );
      }
      // 检查是否转账给平台地址
      const transferToMarket = batchTransfer.list.filter(
        (transfer) => transfer.to === ctx.opts.marketAccount,
      )[0];
      if (!transferToMarket) {
        throw BizError.of(
          'INVALID_TRANSACTION',
          `Invalid receiver address: not found seller address ${ctx.opts.marketAccount}`,
        );
      }
      // 检查转账金额是否符合
      const needTotalPriceDecimal = new Decimal(order.totalPrice.toString());
      const needServiceFeeDecimal = needTotalPriceDecimal
        .mul(new Decimal(ctx.opts.serverFeeRate))
        .ceil();
      const realTotalPriceDecimal = transferToSeller.value;
      const realServiceFeeDecimal = transferToMarket.value;
      if (realTotalPriceDecimal < needTotalPriceDecimal) {
        throw BizError.of(
          'INVALID_TRANSACTION',
          `Invalid total price transfer amount: expect at least ${needTotalPriceDecimal} Planck but got ${realTotalPriceDecimal}`,
        );
      }
      if (realServiceFeeDecimal < needServiceFeeDecimal) {
        throw BizError.of(
          'INVALID_TRANSACTION',
          `Invalid service fee transfer amount: expect at least ${needServiceFeeDecimal} Planck but got ${realServiceFeeDecimal}`,
        );
      }

      // 更新订单为锁定状态,如果更新成功表示抢单成功
      const result = await ctx.prisma.order.updateMany({
        where: {
          id: input.id,
          status: 'PENDING',
        },
        data: {
          status: 'LOCKED',
          buyer: input.buyer,
          updatedAt: new Date(),
        },
      });
      if (result.count === 0) {
        throw BizError.of('ORDER_LOCKED');
      }

      // 提交上链
      const errMsg = await submitAndWaitExtrinsic(ctx.api, extrinsic as any);
      if (errMsg) {
        await ctx.prisma.order.update({
          where: {
            id: input.id,
          },
          data: {
            status: 'FAILED',
            chainStatus: 'BUY_BLOCK_FAILED',
            updatedAt: new Date(),
          },
        });
        throw BizError.of('TRANSFER_FAILED', errMsg);
      }

      // 更新订单子状态为区块确认
      await ctx.prisma.order.update({
        where: {
          id: input.id,
        },
        data: {
          chainStatus: 'BUY_BLOCK_CONFIRMED',
          updatedAt: new Date(),
        },
      });

      return { id: input.id, hash: extrinsic.hash.toHex() };
    }),
});
