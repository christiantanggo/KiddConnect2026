'use client';

import { OrbixChannelProvider } from './OrbixChannelContext';
import OrbixChannelSelector from './OrbixChannelSelector';

export default function OrbixNetworkLayout({ children }) {
  return (
    <OrbixChannelProvider>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2">
          <span className="text-sm font-medium text-gray-600">Channel:</span>
          <OrbixChannelSelector />
        </div>
        {children}
      </div>
    </OrbixChannelProvider>
  );
}
