/**
 * План цеха — отгрузка по неделям (документы из цепочки).
 */

import ShippingChainPanel from '../components/shipping/ShippingChainPanel';

export default function Shipping() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <ShippingChainPanel />
    </div>
  );
}
