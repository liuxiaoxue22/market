import { buildInscribeTransfer, getApi } from 'apps/libs/util';
import { serverConfig } from '../configs/server.config';
import { prisma } from '../server/context';
import { signExtrinsic, submitSignedExtrinsicAndWait } from '../util/dapp';

/**
 * 查询铭文交易状态，1表示成功
 */
async function transactionStatus(hash: string): Promise<number> {
  if (serverConfig.environment !== 'production') {
    return 1;
  }
  const resp = await fetch(
    `${serverConfig.dotaApiUrl}/get_transaction_status?tx_hash=${hash}`,
  );
  const data = await resp.json();
  return data.status;
}

/**
 * 处理卖家挂单，上链成功后，铭文状态确认
 */
export async function sellInscribeCheck() {
  const needCheckOrderList = await prisma.order.findMany({
    where: {
      status: 'PENDING',
      chainStatus: 'SELL_BLOCK_CONFIRMED',
    },
    orderBy: {
      id: 'asc',
    },
  });

  if (!needCheckOrderList.length) {
    return;
  }

  for (const order of needCheckOrderList) {
    const status = await transactionStatus(order.sellHash!!);
    const now = new Date();
    // 如果铭文确认成功更新为挂单中
    if (status === 1) {
      await prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'LISTING',
          chainStatus: 'SELL_INSCRIBE_CONFIRMED',
          listingAt: now,
          updatedAt: now,
        },
      });
    } else if (status == 9) {
      // 铭文不足，挂单失败
      await prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'FAILED',
          chainStatus: 'SELL_INSCRIBE_FAILED',
          failReason: 'Inscribe not enough',
          updatedAt: now,
        },
      });
    }
  }
}

/**
 * 处理卖家取消挂单，上链成功后，铭文状态确认
 */
export async function sellCancelInscribeCheck() {
  const needCheckOrderList = await prisma.order.findMany({
    where: {
      status: 'CANCELING',
      chainStatus: 'CANCEL_BLOCK_CONFIRMED',
    },
    orderBy: {
      id: 'asc',
    },
  });

  if (!needCheckOrderList.length) {
    return;
  }

  for (const order of needCheckOrderList) {
    const status = await transactionStatus(order.cancelHash!!);
    const now = new Date();
    // 如果铭文确认成功更新为已取消
    if (status === 1) {
      await prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'CANCELED',
          chainStatus: 'CANCEL_INSCRIBE_CONFIRMED',
          canceledAt: now,
          updatedAt: now,
        },
      });
    } else if (status == 9) {
      // 铭文不足，挂单失败
      await prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'FAILED',
          chainStatus: 'CANCEL_INSCRIBE_FAILED',
          failReason: 'Inscribe not enough',
          updatedAt: now,
        },
      });
    }
  }
}

/**
 * 处理买家支付完，上链成功后，转铭文给买家
 */
export async function buyBlockCheck() {
  const needCheckOrderList = await prisma.order.findMany({
    where: {
      status: 'LOCKED',
      chainStatus: 'BUY_BLOCK_CONFIRMED',
    },
    orderBy: {
      id: 'asc',
    },
  });

  if (!needCheckOrderList.length) {
    return;
  }

  const api = await getApi();

  for (const order of needCheckOrderList) {
    // 如果已经转账过了，跳过，防止重复转账
    if (order.tradeHash) {
      continue;
    }

    // 构造铭文转账交易数据
    const tradeExtrinsic = await signExtrinsic(
      buildInscribeTransfer(
        api,
        order.tick,
        Number(order.amount),
        order.buyer!!,
      ),
      serverConfig.marketAccountMnemonic,
    );

    // 更新订单交易 hash
    await prisma.order.update({
      where: {
        id: order.id,
      },
      data: {
        tradeHash: tradeExtrinsic.hash.toString(),
        updatedAt: new Date(),
      },
    });

    // 市场账户转账铭文给买家
    const tradeErrMsg = await submitSignedExtrinsicAndWait(api, tradeExtrinsic);
    if (tradeErrMsg) {
      await prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'FAILED',
          chainStatus: 'TRADE_BLOCK_FAILED',
          failReason: tradeErrMsg,
          updatedAt: new Date(),
        },
      });
      continue;
    }

    // 更新订单子状态为区块确认
    await prisma.order.update({
      where: {
        id: order.id,
      },
      data: {
        chainStatus: 'TRADE_BLOCK_CONFIRMED',
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * 处理买家支付完，上链成功后，转铭文给买家
 */
export async function buyInscribeCheck() {
  const needCheckOrderList = await prisma.order.findMany({
    where: {
      status: 'LOCKED',
      chainStatus: 'TRADE_BLOCK_CONFIRMED',
    },
    orderBy: {
      id: 'asc',
    },
  });

  if (!needCheckOrderList.length) {
    return;
  }

  for (const order of needCheckOrderList) {
    const status = await transactionStatus(order.tradeHash!!);
    const now = new Date();
    // 如果铭文确认成功更新为已售出
    if (status === 1) {
      await prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'SOLD',
          chainStatus: 'TRADE_INSCRIBE_CONFIRMED',
          soldAt: now,
          updatedAt: now,
        },
      });
    } else if (status == 9) {
      // 铭文不足，挂单失败
      await prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'FAILED',
          chainStatus: 'TRADE_INSCRIBE_FAILED',
          failReason: 'Inscribe not enough',
          updatedAt: now,
        },
      });
    }
  }
}
