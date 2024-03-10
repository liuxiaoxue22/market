import { useGlobalStateStore } from '@GlobalState';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Divider,
  Image,
} from '@nextui-org/react';
import { Order, Status } from '@prisma/client';
import { calcUnitPrice, fmtDot, toUsd } from '@utils/calc';
import { assertError, trpc } from '@utils/trpc';
import { FC, useState } from 'react';
import { toast } from 'react-toastify';

const statusText: Record<Status, string | undefined> = {
  PENDING: 'Pending',
  LISTING: 'Listing',
  CANCELING: 'Canceling',
  CANCELED: 'Canceled',
  LOCKED: 'Locked',
  FAILED: 'Failed',
  SOLD: 'Sold',
};

export interface MyListCardContext {
  order: Order;
}

export const MyListCard: FC<MyListCardContext> = ({ order }) => {
  const globalState = useGlobalStateStore();
  const [cancelLoading, setCancelLoading] = useState(false);
  const cancel = trpc.order.cancel.useMutation();

  async function handleCancel() {
    setCancelLoading(true);
    try {
      await cancel.mutateAsync(order.id);
    } catch (e) {
      console.error(e);
      const err = assertError(e);
      toast.error(err.code);
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <Card className="w-[220px]">
      <CardHeader>
        <div>
          <div className="text-xs">DOTA</div>
          <div className="text-2xl mt-2 flex w-[200px] justify-center">
            {order.amount.toString()}
          </div>
          <div className="text-xs text-primary mt-2 flex w-[200px] justify-center">
            {toUsd(
              calcUnitPrice(order.totalPrice, order.amount),
              globalState.dotPrice,
            )}
          </div>
        </div>
      </CardHeader>
      <Divider />
      <CardBody>
        <div className="w-full flex justify-between">
          <div className="flex">
            <Image className="w-4 mt-1" src="/dot_logo.png" />
            <div className="ml-1">{fmtDot(order.totalPrice)}</div>
          </div>
          <div className="text-xs mt-1">
            {toUsd(order.totalPrice, globalState.dotPrice)}
          </div>
        </div>
      </CardBody>
      <Divider />
      <CardFooter>
        <div>
          <Button
            className="w-[200px] mt-3"
            color={!statusText[order.status] ? 'primary' : 'default'}
            disabled={!!statusText[order.status]}
            isLoading={cancelLoading}
            onClick={handleCancel}
          >
            {statusText[order.status] || 'Cancel'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};