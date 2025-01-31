import { useGlobalStateStore } from '@GlobalState';
import {
  Button,
  Card,
  CardBody,
  Checkbox,
  Chip,
  Divider,
  Link,
  Select,
  SelectItem,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  useDisclosure,
} from '@nextui-org/react';
import { Order, Status } from '@prisma/client';
import { calcUnitPrice, fmtDecimal, toUsd } from '@utils/calc';
import { assertError, trpc } from '@utils/trpc';
import { desensitizeAddress } from '@utils/wallet';
import { ListRes } from 'apps/backend/src/modules/order';
import { planck2Dot } from 'apps/libs/util';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { LuRefreshCw } from 'react-icons/lu';
import { PiLightningLight } from 'react-icons/pi';
import InfiniteScroll from 'react-infinite-scroller';
import { toast } from 'react-toastify';
import { AssetCard } from '../components/Card/AssetCard';
import { ListCard } from '../components/Card/ListCard';
import { MyListCard } from '../components/Card/MyListCard';
import { BuyModal } from '../components/Modal/BuyModal';
import { ConfirmModal } from '../components/Modal/ConfirmModal';
import { SellModal } from '../components/Modal/SellModal';

const polkadotScan = import.meta.env.VITE_POLKADOT_SCAN;
const pageSize = 15;

type AutoRefresh = {
  id: bigint;
  targetStatus: Status;
};

const statusText: Record<Status, string | undefined> = {
  PENDING: 'Pending',
  LISTING: 'Listing',
  CANCELING: 'Canceling',
  CANCELED: 'Canceled',
  LOCKED: 'Trading',
  SOLD: 'Sold',
  FAILED: undefined,
};

function getHashByStatus(order: Order): string {
  if (['PENDING', 'LISTING'].includes(order.status)) {
    return order.sellHash;
  }
  if (['CANCELING', 'CANCELED'].includes(order.status)) {
    return order.cancelHash!;
  }
  if (order.status === 'LOCKED') {
    return order.buyHash!;
  }
  if (order.status === 'SOLD') {
    return order.tradeHash!;
  }
  return '';
}

export function Market() {
  const { account, dotPrice, assetInfos } = useGlobalStateStore();
  const [selectAssetId, setSelectAssetId] = useState<string>('');
  const [selectTab, setSelectTab] = useState<string>('Listed');
  const [selectStatus, setSelectStatus] = useState<string>('ALL');
  const [listRefresh, setListRefresh] = useState(false);
  const [myOrdersSelected, setMyOrdersSelected] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState<AutoRefresh | null>(null);
  const { client } = trpc.useUtils();
  const cancelOrder = trpc.order.cancel.useMutation();

  const {
    isOpen: isOpenBuyModal,
    onOpen: onOpenBuyModal,
    onOpenChange: onOpenChangeBuyModal,
  } = useDisclosure();
  const [buyModalOrderInfo, setBuyModalOrderInfo] = useState<Order>(
    {} as Order,
  );
  const {
    isOpen: isSellOpen,
    onOpen: onSellOpen,
    onOpenChange: onSellOpenChange,
  } = useDisclosure();

  const [cancelModalOrderId, setCancelModalOrderId] = useState<bigint>(0n);
  const {
    isOpen: isCancelModalOpen,
    onOpen: onOpenCancelModal,
    onOpenChange: onCancelModalOpenChange,
  } = useDisclosure();
  function onOpenCancelModalWithData(orderId: bigint) {
    if (!account) {
      toast.warn('Please connect wallet first');
      return;
    }
    setCancelModalOrderId(orderId);
    onOpenCancelModal();
  }

  async function onCancelOrder(id: bigint) {
    try {
      await cancelOrder.mutateAsync(id);
      onCancelSuccess(id);
      toast.success(
        'Cancel success, please wait for DOT20 index update, it may take a few minutes.',
      );
    } catch (e) {
      console.error(e);
      const err = assertError(e);
      toast.error(err.code);
    }
  }

  function onBuySuccess(id: bigint) {
    setSelectTab('Orders');
    clearList('Orders');
    setAutoRefresh({ id, targetStatus: 'SOLD' });
  }

  function onSellSuccess(id: bigint) {
    setSelectTab('MyList');
    clearList('MyList');
    setAutoRefresh({ id, targetStatus: 'LISTING' });
  }

  function onCancelSuccess(id: bigint) {
    setSelectTab('MyList');
    clearList('MyList');
    setAutoRefresh({ id, targetStatus: 'CANCELED' });
  }

  const [listedOrderList, setListedOrderList] = useState<ListRes>({
    total: -1,
    list: [],
  });
  const [orderList, setOrderList] = useState<ListRes>({
    total: -1,
    list: [],
  });
  const [myOrderList, setMyOrderList] = useState<ListRes>({
    total: -1,
    list: [],
  });

  function clearList(tab?: string) {
    const refreshTab = tab || selectTab;
    if (refreshTab === 'Listed') {
      setListedOrderList({ total: -1, list: [] });
    }
    if (refreshTab === 'Orders') {
      setOrderList({ total: -1, list: [] });
    }
    if (refreshTab === 'MyList') {
      setMyOrderList({ total: -1, list: [] });
    }
  }

  useEffect(() => {
    if (!assetInfos.length) {
      return;
    }
    if (!selectAssetId) {
      setSelectAssetId(assetInfos[0].id);
      return;
    }
  }, [assetInfos]);

  useEffect(() => {
    clearList();
  }, [account]);

  useEffect(() => {
    if (autoRefresh) {
      const timer = setInterval(async () => {
        const order = await client.order.detail.query(autoRefresh.id);
        if (order.status === autoRefresh.targetStatus) {
          setAutoRefresh(null);
          setListedOrderList((list) => {
            return {
              ...list,
              list: list.list.map((e) => {
                if (e.id === autoRefresh.id) {
                  return order;
                }
                return e;
              }),
            };
          });
          setMyOrderList((list) => {
            return {
              ...list,
              list: list.list.map((e) => {
                if (e.id === autoRefresh.id) {
                  return order;
                }
                return e;
              }),
            };
          });
          setOrderList((list) => {
            return {
              ...list,
              list: list.list.map((e) => {
                if (e.id === autoRefresh.id) {
                  return order;
                }
                return e;
              }),
            };
          });
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [autoRefresh]);

  async function changeAsset(assetId: string) {
    if (assetId === selectAssetId) {
      return;
    }
    setSelectAssetId(assetId);
    clearList();
  }

  async function fetchListedOrderList() {
    if (!selectAssetId) {
      return;
    }
    const resp = await client.order.list.query({
      assetId: selectAssetId,
      cursor: listedOrderList.next,
      limit: pageSize,
      statues: ['LISTING', 'LOCKED'],
      orderBy: 'price_asc',
    });

    setListedOrderList((list) => {
      return {
        ...resp,
        list: list.list.concat(
          resp.list.filter((e) => !list.list.some((ee) => ee.id === e.id)),
        ),
      };
    });
  }

  async function fetchOrderList() {
    const resp = await client.order.list.query({
      assetId: selectAssetId,
      account: myOrdersSelected ? account : undefined,
      cursor: orderList.next,
      limit: pageSize,
      statues: (Object.keys(statusText) as Status[]).filter(
        (e) =>
          statusText[e] && (selectStatus === 'ALL' ? true : e === selectStatus),
      ),
      orderBy: 'update_desc',
    });

    setOrderList((list) => {
      return {
        ...resp,
        list: list.list.concat(
          resp.list.filter((e) => !list.list.some((ee) => ee.id === e.id)),
        ),
      };
    });
  }

  async function fetchMyOrderList() {
    if (!account) {
      return;
    }
    const resp = await client.order.list.query({
      assetId: selectAssetId,
      cursor: myOrderList.next,
      limit: pageSize,
      seller: account,
      orderBy: 'create_desc',
    });

    setMyOrderList((list) => {
      return {
        ...resp,
        list: list.list.concat(
          resp.list.filter((e) => !list.list.some((ee) => ee.id === e.id)),
        ),
      };
    });
  }

  function onOpenBuyModalWithData(order: Order) {
    if (!account) {
      toast.warn('Please connect wallet first');
      return;
    }
    setBuyModalOrderInfo(order);
    onOpenBuyModal();
  }

  return (
    <>
      <div className="flex justify-center mt-10">
        <div className="flex w-88 xxs:w-96 xs:w-full xs:px-2 flex-col lg:w-4/5">
          <div className="flex justify-between">
            <p className="text-large fw-600 mb-6 text-primary">
              Trending Inscriptions
            </p>
            <Button
              className="w-32 ml-4"
              radius="full"
              color="primary"
              startContent={<PiLightningLight />}
              onClick={() => {
                if (!account) {
                  toast.warn('Please connect wallet first');
                  return;
                }
                onSellOpen();
              }}
            >
              Quick List
            </Button>
          </div>
          <div className="mb-2 pb-2 w-full overflow-x-auto">
            <div className="flex gap-4">
              {assetInfos.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  selected={selectAssetId === asset.id}
                  changeAsset={changeAsset}
                />
              ))}
            </div>
          </div>
          <Divider />
          <LuRefreshCw
            size={20}
            className={`relative top-[30px] left-64 cursor-pointer ${
              listRefresh && 'animate-spin'
            }`}
            onClick={() => {
              if (listRefresh) {
                return;
              }
              setListRefresh(true);
              setTimeout(() => {
                setListRefresh(false);
              }, 1000);
              clearList();
            }}
          />
          <Tabs
            aria-label="Options"
            selectedKey={selectTab}
            onSelectionChange={(key) => {
              setSelectTab(key as string);
              clearList(key as string);
            }}
          >
            <Tab key="Listed" title="Listed">
              <InfiniteScroll
                loadMore={fetchListedOrderList}
                hasMore={listedOrderList.total === -1 || !!listedOrderList.next}
              >
                {listedOrderList.list.length ? (
                  <div className="flex items-center gap-3 xs:gap-4 flex-wrap">
                    {listedOrderList.list.map((order) => (
                      <ListCard
                        key={order.id}
                        order={order}
                        onOpenBuyModal={() => onOpenBuyModalWithData(order)}
                      />
                    ))}
                  </div>
                ) : (
                  <Card className="w-full text-foreground-400 align-middle text-center">
                    <CardBody className="flex items-center justify-center h-64">
                      <p>No Result</p>
                    </CardBody>
                  </Card>
                )}
              </InfiniteScroll>
            </Tab>
            <Tab key="Orders" title="Orders">
              <div className="flex justify-end gap-6 mb-4 -mt-12">
                <Checkbox
                  size="sm"
                  isSelected={myOrdersSelected}
                  onValueChange={setMyOrdersSelected}
                >
                  My orders
                </Checkbox>
                <Select
                  size="sm"
                  label="Filter status"
                  className="w-40"
                  selectedKeys={[selectStatus]}
                  onChange={(e) => {
                    setSelectStatus(e.target.value);
                    setOrderList({
                      total: -1,
                      list: [],
                    });
                    setTimeout(() => {
                      fetchOrderList();
                    }, 100);
                  }}
                >
                  <SelectItem key={'ALL'} value={'ALL'}>
                    All
                  </SelectItem>
                  <SelectItem key={'PENDING'} value={'PENDING'}>
                    Pending
                  </SelectItem>
                  <SelectItem key={'LISTING'} value={'LISTING'}>
                    Listing
                  </SelectItem>
                  <SelectItem key={'SOLD'} value={'SOLD'}>
                    Sold
                  </SelectItem>
                  <SelectItem key={'CANCELED'} value={'CANCELED'}>
                    Canceled
                  </SelectItem>
                </Select>
              </div>
              <InfiniteScroll
                loadMore={fetchOrderList}
                hasMore={orderList.total === -1 || !!orderList.next}
              >
                <Table aria-label="collection table">
                  <TableHeader>
                    <TableColumn>Date Time</TableColumn>
                    <TableColumn>Status</TableColumn>
                    <TableColumn>Amount</TableColumn>
                    <TableColumn>Unit Price (10k)</TableColumn>
                    <TableColumn>Total Value</TableColumn>
                    <TableColumn>Buyer</TableColumn>
                    <TableColumn>Seller</TableColumn>
                    <TableColumn>Hash</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent={'No Result'}>
                    {orderList.list.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          {dayjs(order.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
                        </TableCell>
                        <TableCell>
                          <Chip>{statusText[order.status]}</Chip>
                        </TableCell>
                        <TableCell>
                          {fmtDecimal(
                            planck2Dot(
                              order.amount,
                              assetInfos.find(
                                (asset) => asset.id === order.assetId,
                              )?.decimals,
                            ),
                          )}
                        </TableCell>
                        <TableCell>
                          {toUsd(
                            calcUnitPrice(
                              order.totalPrice,
                              order.amount,
                              assetInfos.find(
                                (asset) => asset.id === order.assetId,
                              )?.decimals,
                            ),
                            dotPrice,
                          )}
                        </TableCell>
                        <TableCell>
                          {toUsd(order.totalPrice, dotPrice)}
                        </TableCell>
                        <TableCell>
                          <Link
                            target="_blank"
                            href={`${polkadotScan}/account/${order.buyer}`}
                            color="primary"
                          >
                            {desensitizeAddress(order.buyer!!)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            target="_blank"
                            href={`${polkadotScan}/account/${order.seller}`}
                            color="primary"
                          >
                            {desensitizeAddress(order.seller)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            isBlock
                            showAnchorIcon
                            target="_blank"
                            href={`${polkadotScan}/extrinsic/${getHashByStatus(
                              order,
                            )}`}
                            color="primary"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </InfiniteScroll>
            </Tab>
            <Tab key="MyList" title="My List">
              <InfiniteScroll
                loadMore={fetchMyOrderList}
                hasMore={myOrderList.total === -1 || !!myOrderList.next}
              >
                {myOrderList.list.length ? (
                  <div className="flex items-center gap-4 flex-wrap">
                    {myOrderList.list.map((order) => (
                      <MyListCard
                        key={order.id}
                        order={order}
                        onOpenCancelModal={() =>
                          onOpenCancelModalWithData(order.id)
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <Card className="w-full text-foreground-400 align-middle text-center">
                    <CardBody className="flex items-center justify-center h-64">
                      <p>No Result</p>
                    </CardBody>
                  </Card>
                )}
              </InfiniteScroll>
            </Tab>
          </Tabs>
        </div>
      </div>
      {account && (
        <BuyModal
          order={buyModalOrderInfo}
          isOpen={isOpenBuyModal}
          onSuccess={onBuySuccess}
          onOpenChange={onOpenChangeBuyModal}
        />
      )}
      {account && (
        <SellModal
          assetId={selectAssetId}
          isOpen={isSellOpen}
          onOpenChange={onSellOpenChange}
          onSuccess={onSellSuccess}
        />
      )}
      <ConfirmModal
        text="Please confirm that you want to cancel the listing"
        isOpen={isCancelModalOpen}
        onOpenChange={onCancelModalOpenChange}
        onConfirm={() => onCancelOrder(cancelModalOrderId)}
      />
    </>
  );
}
