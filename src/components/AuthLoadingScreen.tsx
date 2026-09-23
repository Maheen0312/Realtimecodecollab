import React, { FC } from 'react';
import { CodeDeathLogo } from './CodeDeathLogo';
import { motion } from 'motion/react';

interface AuthLoadingScreenProps {
  message?: string;
}

export const AuthLoadingScreen: FC<AuthLoadingScreenProps> = ({
  message = 'Checking authentication & initializing workspace...',
}) => {
  return (
    <div className="min-h-screen w-full bg-[#0b0f19] flex flex-col items-center justify-center relative overflow-hidden font-sans text-slate-100">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-cyan-500/10 via-rose-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      
      {/* Subtle matrix dots */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px] opacity-40 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center max-w-sm w-full px-6 text-center space-y-6">
        {/* Animated Brand Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <CodeDeathLogo size="xl" showText={true} subtitle="COLLABORATIVE DEV ENVIRONMENT" />
        </motion.div>

        {/* Status Indicator */}
        <div className="w-full space-y-3 pt-4">
          <div className="h-1 w-full bg-slate-800/80 rounded-full overflow-hidden relative">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-rose-500"
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
              <span>{message}</span>
            </span>
            <span className="text-slate-500">v3.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};
