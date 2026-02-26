import React from 'react';

export const BackgroundDecor = () => {
    return (
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[120px] animate-pulse" />
            <div className="absolute bottom-[20%] right-[-5%] w-[30%] h-[50%] rounded-full bg-indigo-600/10 blur-[100px]" />
            <div className="absolute top-[40%] right-[10%] w-[20%] h-[20%] rounded-full bg-emerald-500/10 blur-[80px]" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.15] mix-blend-overlay" />
        </div>
    );
};
