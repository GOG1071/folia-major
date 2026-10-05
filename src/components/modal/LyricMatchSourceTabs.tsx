import React from 'react';
import { LYRIC_MATCH_SOURCES } from '../../utils/lyrics/lyricMatchSources';
import { getLyricMatchSourceLabel, type LyricMatchSource } from './lyricMatchResultHelpers';

// src/components/modal/LyricMatchSourceTabs.tsx
// Source tab strip shared by the lyric match modals; renders nothing while there is only one source.

interface LyricMatchSourceTabsProps {
    source: LyricMatchSource;
    onChange: (source: LyricMatchSource) => void;
    isDaylight: boolean;
    className?: string;
}

export const LyricMatchSourceTabs: React.FC<LyricMatchSourceTabsProps> = ({ source, onChange, isDaylight, className = '' }) => {
    if (LYRIC_MATCH_SOURCES.length < 2) {
        return null;
    }

    const borderColor = isDaylight ? 'border-black/5' : 'border-white/10';
    return (
        <div className={`flex border-b ${borderColor} pb-2 gap-4 ${className}`}>
            {LYRIC_MATCH_SOURCES.map(id => {
                const activeTabClass = source === id
                    ? isDaylight
                        ? 'border-blue-500 text-blue-600 font-semibold'
                        : 'border-blue-400 text-blue-300 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200';
                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onChange(id)}
                        className={`pb-2 border-b-2 text-sm transition-all px-1 cursor-pointer ${activeTabClass}`}
                    >
                        {getLyricMatchSourceLabel(id)}
                    </button>
                );
            })}
        </div>
    );
};
