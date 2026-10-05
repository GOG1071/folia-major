import React, { useState } from 'react';
import FmTab from '../../src/components/panelTab/FmTab';
import { PlayerState } from '../../src/types';
import type { ProbeDefinition } from './definition';
// dev/probes/fmTab.probe.tsx

/**
 * FM 面板只在私人 FM 播放时出现，整应用测试很难走到那个状态。这里单独挂它，用来看明暗两套配色。
 */
const FmTabProbe: React.FC = () => {
    const [isDaylight, setIsDaylight] = useState(false);

    return (
        <div
            className="flex min-h-screen flex-col items-center justify-center gap-6 p-10"
            style={{
                backgroundColor: isDaylight ? '#f4f4f5' : '#0b0b0d',
                ['--bg-color' as string]: isDaylight ? '#f4f4f5' : '#0b0b0d',
                ['--text-primary' as string]: isDaylight ? '#18181b' : '#fafafa',
            }}
        >
            <div className="flex gap-3 text-xs" style={{ color: isDaylight ? '#18181b' : '#fafafa' }}>
                <button data-probe-toggle="daylight" onClick={() => setIsDaylight(value => !value)}>
                    toggle daylight
                </button>
            </div>
            <div className="w-[360px] rounded-2xl border border-white/10">
                <FmTab
                    playerState={PlayerState.PLAYING}
                    onTogglePlay={() => {}}
                    onNextTrack={() => {}}
                    onPrevTrack={() => {}}
                    onTrash={() => {}}
                    onLike={() => {}}
                    isLiked={false}
                    isDaylight={isDaylight}
                    primaryColor="#7dd3fc"
                />
            </div>
        </div>
    );
};

const definition: ProbeDefinition = {
    id: 'fmTab',
    title: '播放面板 · 私人 FM',
    description: 'FM 控制面板。验证明暗配色。',
    Component: FmTabProbe,
};

export default definition;
