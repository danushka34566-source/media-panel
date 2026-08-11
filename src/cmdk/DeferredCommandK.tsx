'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { getCommandKDataAction } from './actions';
import type { CommandKData } from './data';

const CommandKClient = dynamic(() => import('./CommandKClient'));

export default function DeferredCommandK() {
  const [data, setData] = useState<CommandKData>();

  useEffect(() => {
    let isActive = true;
    getCommandKDataAction()
      .then(result => {
        if (isActive) { setData(result); }
      })
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, []);

  return data ? <CommandKClient {...data} /> : null;
}
