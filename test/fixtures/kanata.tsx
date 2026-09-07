// Full Kanata + real providers, fresh browser storage; never part of the production entry.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OSProvider } from '../../context/OSContext';
import { MusicProvider } from '../../context/MusicContext';
import VRWorldApp from '../../apps/VRWorldApp';
localStorage.setItem('vr_sar_club_state_v1',JSON.stringify({version:1,updateSeenVersion:1,npcPreference:'hide',caianMet:false}));
localStorage.setItem('vr_help_seen','1');
createRoot(document.getElementById('root')!).render(<OSProvider><MusicProvider><VRWorldApp/></MusicProvider></OSProvider>);
