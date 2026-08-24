'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { getCommandKDataAction } from './actions';
import type { CommandKData } from './data';

const CommandKClient = dynamic(() => import('./CommandKClient'));

// The command surface must remain usable even when a cold database/category
// read is unavailable. Media search is fetched only after the user types, so
// an empty metadata snapshot is a safe shell fallback rather than rendering
// no search panel at all.
const EMPTY_COMMAND_K_DATA: CommandKData = {
  recents: [],
  years: [],
  cameras: [],
  lenses: [],
  albums: [],
  tags: [],
  recipes: [],
  films: [],
  focalLengths: [],
  categories: [],
  studios: [],
  performers: [],
  contentTypes: [],
  footer: '',
};

export default function DeferredCommandK() {
  // Mount the command surface immediately. The category snapshot is helpful
  // for its initial sections, but it must never gate the search button or
  // keyboard shortcut behind a slow/failing server action.
  const [data, setData] = useState<CommandKData>(EMPTY_COMMAND_K_DATA);

  useEffect(() => {
    let isActive = true;
    getCommandKDataAction()
      .then(result => {
        if (isActive) { setData(result); }
      })
      .catch(() => {
        if (isActive) { setData(EMPTY_COMMAND_K_DATA); }
      });
    return () => {
      isActive = false;
    };
  }, []);

  return <CommandKClient {...data} />;
}
